const { PricingConfig, PricingChange } = require('../models/PricingConfig');

// ── Pricing ka single source of truth ─────────────────────────────────────────
// Customer ka fare, rider ki kamai aur wallet commission — teeno yahin ke config se
// bante hain. Config admin panel se DB me save hota hai; DB me na ho to DEFAULTS
// (purane hardcoded rate) chalte hain, taaki pehli baar deploy par kuch na tute.

const IST_OFFSET_MIN = 330;
const SIZES = ['small', 'medium', 'large'];

// Purane fareCalculator ke rate. Commission wahi jo wallet asal me kaat raha tha (env).
function envCommissionPercent() {
  const pct = Number(process.env.COMMISSION_PERCENT);
  return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 20;
}
const DEFAULTS = () => ({
  baseFare: 30,
  minDistanceKm: 0.5,
  slabs: [{ upToKm: null, perKmRate: 10 }],
  weightLimitKg: 1,
  weightRate: 5,
  fragileCharge: 20,
  sizeCharges: { small: 0, medium: 15, large: 30 },
  nightEnabled: true,
  nightMultiplier: 1.2,
  nightStartHour: 22,
  nightEndHour: 6,
  commissionPercent: envCommissionPercent(),
});

const FIELDS = Object.keys(DEFAULTS());
const r2 = n => Math.round(n * 100) / 100;
const pick = doc => {
  const out = {};
  for (const k of FIELDS) out[k] = doc[k];
  out.slabs = (doc.slabs || []).map(s => ({ upToKm: s.upToKm ?? null, perKmRate: s.perKmRate }));
  out.sizeCharges = { small: doc.sizeCharges?.small ?? 0, medium: doc.sizeCharges?.medium ?? 0, large: doc.sizeCharges?.large ?? 0 };
  return out;
};

// ── validation ────────────────────────────────────────────────────────────────
class PricingError extends Error {}

function num(v, label, min, max) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new PricingError(`${label} must be a number`);
  if (n < min || n > max) throw new PricingError(`${label} must be between ${min} and ${max}`);
  return r2(n);
}
function hour(v, label) {
  const n = num(v, label, 0, 23);
  if (!Number.isInteger(n)) throw new PricingError(`${label} must be a whole hour (0–23)`);
  return n;
}

// Admin ka bheja config saaf + check karo. Galat ho to PricingError (400) — kabhi
// aisa config save na ho jisse fare NaN/negative ban jaaye.
function validatePricing(input) {
  if (!input || typeof input !== 'object') throw new PricingError('Pricing config is required');
  const slabsIn = Array.isArray(input.slabs) ? input.slabs : [];
  if (slabsIn.length < 1 || slabsIn.length > 10) throw new PricingError('Add between 1 and 10 distance slabs');

  let prev = 0;
  const slabs = slabsIn.map((s, i) => {
    const last = i === slabsIn.length - 1;
    const perKmRate = num(s?.perKmRate, `Slab ${i + 1} rate`, 0, 1000);
    if (last) return { upToKm: null, perKmRate };
    const upToKm = num(s?.upToKm, `Slab ${i + 1} distance`, 0.1, 2000);
    if (upToKm <= prev) throw new PricingError(`Slab ${i + 1} must end after ${prev} km`);
    prev = upToKm;
    return { upToKm, perKmRate };
  });

  const sizeCharges = {};
  for (const s of SIZES) sizeCharges[s] = num(input.sizeCharges?.[s], `${s[0].toUpperCase() + s.slice(1)} size charge`, 0, 5000);

  const nightEnabled = !!input.nightEnabled;
  const out = {
    baseFare:          num(input.baseFare, 'Base fare', 0, 10000),
    minDistanceKm:     num(input.minDistanceKm, 'Minimum distance', 0, 50),
    slabs,
    weightLimitKg:     num(input.weightLimitKg, 'Free weight', 0, 500),
    weightRate:        num(input.weightRate, 'Weight rate', 0, 1000),
    fragileCharge:     num(input.fragileCharge, 'Fragile charge', 0, 5000),
    sizeCharges,
    nightEnabled,
    nightMultiplier:   num(input.nightMultiplier, 'Night multiplier', 1, 3),
    nightStartHour:    hour(input.nightStartHour, 'Night start'),
    nightEndHour:      hour(input.nightEndHour, 'Night end'),
    commissionPercent: num(input.commissionPercent, 'Commission', 0, 90),
  };
  if (nightEnabled && out.nightStartHour === out.nightEndHour) throw new PricingError('Night start and end hour cannot be the same');
  return out;
}

// ── read / write (15s cache — har fare par DB hit nahi) ──────────────────────
const CACHE_MS = 15_000;
let cache = null;
let cacheAt = 0;

async function getPricing() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const doc = await PricingConfig.findOne({ key: 'default' }).lean();
  cache = doc
    ? { ...pick(doc), version: doc.version, updatedAt: doc.updatedAt, isDefault: false }
    : { ...DEFAULTS(), version: 0, updatedAt: null, isDefault: true };
  cacheAt = Date.now();
  return cache;
}

// expectedVersion: do admin ek saath edit karein to doosre ka save purane version par
// na chal jaaye (409). Har save PricingChange me audit ke liye jaata hai.
async function savePricing(input, { note = '', ip = '', expectedVersion } = {}) {
  const config = validatePricing(input);
  const current = await getPricingFresh();
  if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== current.version) {
    const e = new PricingError('Pricing was changed by someone else. Reload to see the latest rates.');
    e.status = 409;
    throw e;
  }
  const version = current.version + 1;
  const doc = await PricingConfig.findOneAndUpdate(
    { key: 'default', ...(current.isDefault ? {} : { version: current.version }) },
    { $set: { ...config, version } },
    { upsert: current.isDefault, returnDocument: 'after', lean: true }
  );
  if (!doc) {
    const e = new PricingError('Pricing was changed by someone else. Reload to see the latest rates.');
    e.status = 409;
    throw e;
  }
  await PricingChange.create({ version, previous: pick(current), config, note: String(note).slice(0, 500), ip });
  cache = null;
  return getPricing();
}

async function getPricingFresh() { cache = null; return getPricing(); }

async function getPricingHistory(limit = 25) {
  return PricingChange.find().sort({ createdAt: -1 }).limit(limit).lean();
}

// ── fare calculation ─────────────────────────────────────────────────────────
function isNightIST(cfg, at = new Date()) {
  if (!cfg.nightEnabled || cfg.nightMultiplier <= 1) return false;
  // Server UTC ho ya IST — night hamesha India ke time se
  const h = new Date(at.getTime() + IST_OFFSET_MIN * 60_000).getUTCHours();
  const { nightStartHour: s, nightEndHour: e } = cfg;
  return s > e ? h >= s || h < e : h >= s && h < e;
}

const kmText = n => String(r2(n));

// Tiered slabs: har slab ke km apne rate se (jaise income tax brackets).
// Return me line-items bhi — customer app, rider app aur admin panel teeno yahi dikhate hain.
function computeFare(cfg, { distanceKm, parcel = {}, at = new Date(), night } = {}) {
  const rawKm = Math.max(Number(distanceKm) || 0, 0);
  const d = Math.max(rawKm, cfg.minDistanceKm);
  const lines = [{ key: 'base', label: 'Base fare', amount: cfg.baseFare }];

  let from = 0;
  for (const slab of cfg.slabs) {
    const to = slab.upToKm ?? Infinity;
    const km = Math.min(d, to) - from;
    if (km > 0) {
      lines.push({
        key: 'distance',
        label: to === Infinity ? (from ? `Distance above ${kmText(from)} km` : 'Distance') : `Distance ${kmText(from)}–${kmText(to)} km`,
        detail: `${kmText(km)} km × ₹${slab.perKmRate}/km`,
        fromKm: r2(from), toKm: slab.upToKm ?? null, km: r2(km), rate: slab.perKmRate,
        amount: r2(km * slab.perKmRate),
      });
    }
    if (d <= to) break;
    from = to;
  }

  const weight = Number(parcel.weight) || 1;
  if (weight > cfg.weightLimitKg && cfg.weightRate > 0) {
    const extra = r2(weight - cfg.weightLimitKg);
    lines.push({ key: 'weight', label: 'Extra weight', detail: `${extra} kg × ₹${cfg.weightRate}/kg`, amount: r2(extra * cfg.weightRate) });
  }
  const size = SIZES.includes(parcel.size) ? parcel.size : 'small';
  if (cfg.sizeCharges[size] > 0) lines.push({ key: 'size', label: 'Parcel size', detail: size, amount: cfg.sizeCharges[size] });
  if (parcel.isFragile && cfg.fragileCharge > 0) lines.push({ key: 'fragile', label: 'Fragile handling', amount: cfg.fragileCharge });

  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const isNight = night ?? isNightIST(cfg, at);
  const nightCharge = isNight && cfg.nightEnabled ? r2(subtotal * (cfg.nightMultiplier - 1)) : 0;
  const total = Math.round(subtotal + nightCharge);
  // Commission poore rupaye me — rider ko ₹153.90 jaisi kamai na dikhe
  const commission = Math.round((total * cfg.commissionPercent) / 100);

  return {
    estimated: total,
    distance: r2(d),
    riderEarning: total - commission,
    commission,
    commissionPercent: cfg.commissionPercent,
    pricingVersion: cfg.version ?? null,
    breakdown: {
      distanceKm: r2(d),
      lines,
      subtotal,
      night: nightCharge > 0,
      nightMultiplier: cfg.nightMultiplier,
      nightCharge,
      rounding: r2(total - subtotal - nightCharge),
      total,
    },
  };
}

// Pricing system aane se pehle ke orders — unke paas snapshot nahi, to purane fixed
// rate se line-items dobara banao (night ×1.2 tabhi maano jab saved fare se mile).
function legacyBreakdown(order) {
  const cfg = { ...DEFAULTS(), nightEnabled: false };
  const base = computeFare(cfg, { distanceKm: order.fare?.distance || 0, parcel: order.parcel || {} }).breakdown;
  const charged = order.fare?.estimated || 0;
  const nightFits = Math.abs(Math.round(base.subtotal * 1.2) - charged) <= 1 && Math.abs(Math.round(base.subtotal) - charged) > 1;
  const nightCharge = nightFits ? r2(base.subtotal * 0.2) : 0;
  return { ...base, night: nightFits, nightMultiplier: 1.2, nightCharge, rounding: r2(charged - base.subtotal - nightCharge), total: charged, legacy: true };
}

module.exports = {
  DEFAULTS, PricingError, validatePricing, getPricing, getPricingFresh, savePricing, getPricingHistory,
  computeFare, legacyBreakdown, isNightIST,
};
