const Order             = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const { success, error } = require('../utils/apiResponse');
const { walletMinBalancePaise } = require('../utils/commission');
const {
  DEFAULTS, PricingError, validatePricing, getPricing, savePricing, getPricingHistory, computeFare, legacyBreakdown,
} = require('../utils/pricing');

const MAX_ROWS = 5000;
const DAY_MS   = 24 * 60 * 60 * 1000;

// Order ka commission (paise) — snapshot ho to wahi, warna diye gaye % se
const expectedCommissionPaise = (o, farePaise, fallbackPct) => {
  if (typeof o.fare?.commission === 'number' && o.fare.final === o.fare.estimated) return Math.min(Math.round(o.fare.commission * 100), farePaise);
  const pct = typeof o.fare?.commissionPercent === 'number' ? o.fare.commissionPercent : fallbackPct;
  return Math.round((farePaise * pct) / 100);
};

// GET /api/v1/admin/commission?days=30   (days=0 = sab)
// Har delivered order ka hisaab: fare kaise bana (line items), HIREON ka commission,
// rider ka net, aur wallet me asal me kya entry hui. Sirf padhta hai, DB me kuch nahi likhta.
const getCommission = async (req, res) => {
  try {
    const days  = Math.min(Math.max(parseInt(req.query.days, 10) || 0, 0), 3650);
    const query = { status: 'delivered' };
    if (days) query.deliveredAt = { $gte: new Date(Date.now() - days * DAY_MS) };

    const [orders, pricing] = await Promise.all([
      Order.find(query)
        .select('orderId customer rider parcel fare paymentMethod paymentStatus riderEarning deliveredAt createdAt')
        .sort({ deliveredAt: -1 })
        .limit(MAX_ROWS)
        .populate('customer', 'name phone')
        .populate('rider', 'name phone')
        .lean(),
      getPricing(),
    ]);

    // Settlement ki asli entry — order+type unique hai, to har order ki max ek entry
    const txns = await WalletTransaction.find({
      order: { $in: orders.map(o => o._id) },
      type:  { $in: ['EARNING', 'COMMISSION_DEBIT'] },
    }).select('order type amount balanceAfter createdAt').lean();
    const txnBy = new Map(txns.map(t => [t.order.toString(), t]));

    const rows = orders.map(o => {
      const fare      = o.fare?.final || o.fare?.estimated || 0;
      const farePaise = Math.round(fare * 100);
      const t = txnBy.get(o._id.toString());
      // ONLINE: rider ko (fare - commission) credit → commission = fare - credit
      // COD:    cash rider ke paas → commission wallet se debit
      const settlement = t ? {
        type: t.type,
        amountPaise: t.amount,
        commissionPaise: t.type === 'EARNING' ? farePaise - t.amount : t.amount,
        balanceAfterPaise: t.balanceAfter,
        at: t.createdAt,
      } : null;
      return {
        _id: o._id,
        orderId: o.orderId,
        customer: o.customer,
        rider: o.rider,
        paymentMethod: o.paymentMethod || 'COD',
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt,
        farePaise,
        appRiderEarning: o.riderEarning || 0,
        pricingVersion: o.fare?.pricingVersion ?? null,
        commissionPercent: o.fare?.commissionPercent ?? null,
        expectedCommissionPaise: expectedCommissionPaise(o, farePaise, pricing.commissionPercent),
        breakdown: o.fare?.breakdown?.lines ? o.fare.breakdown : legacyBreakdown(o),
        settlement,
      };
    });

    res.json(success('Commission data', {
      serverTime: new Date(),
      capped: orders.length === MAX_ROWS,
      config: { pricing, walletMinBalancePaise: walletMinBalancePaise() },
      rows,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/admin/pricing — aaj ka rate card + badlav ka itihaas
const getPricingAdmin = async (req, res) => {
  try {
    const [pricing, history] = await Promise.all([getPricing(), getPricingHistory(25)]);
    res.json(success('Pricing', { pricing, defaults: DEFAULTS(), history }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// PUT /api/v1/admin/pricing   Body: { config, note, version }
// Save hote hi (max ~15s cache) naye orders/estimate isi rate par bante hain.
const updatePricing = async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (note.length < 3) return res.status(400).json(error('Add a short reason for this change'));
    const pricing = await savePricing(req.body?.config, { note, ip: req.ip || '', expectedVersion: req.body?.version });
    const history = await getPricingHistory(25);
    res.json(success('Pricing updated', { pricing, history }));
  } catch (err) {
    if (err instanceof PricingError) return res.status(err.status || 400).json(error(err.message));
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/admin/pricing/preview   Body: { config, quote: { distanceKm, weightKg, size, fragile, night } }
// Save karne se pehle: aaj vs naye rate par sample trips, ek custom trip, aur pichhle
// 30 din ke delivered orders naye rate par kitne ke bante. Kuch save nahi karta.
const SAMPLE_KM = [2, 5, 10, 25, 50, 100];
const previewPricing = async (req, res) => {
  let draft;
  try {
    draft = validatePricing(req.body?.config);
  } catch (err) {
    if (err instanceof PricingError) return res.json(success('Invalid', { error: err.message }));
    return res.status(500).json(error(err.message));
  }
  try {
    const current = await getPricing();
    const q = req.body?.quote || {};
    const tripParcel = { weight: Number(q.weightKg) || 1, size: q.size, isFragile: !!q.fragile };
    const trip = { distanceKm: Number(q.distanceKm) || 0, parcel: tripParcel, night: !!q.night };
    const brief = f => ({ fare: f.estimated, commission: f.commission, riderEarning: f.riderEarning });

    const samples = SAMPLE_KM.map(km => ({
      km,
      current: brief(computeFare(current, { distanceKm: km, night: false })),
      draft:   brief(computeFare(draft, { distanceKm: km, night: false })),
    }));

    const recent = await Order.find({ status: 'delivered', deliveredAt: { $gte: new Date(Date.now() - 30 * DAY_MS) } })
      .select('fare parcel').limit(MAX_ROWS).lean();
    const impact = { orders: recent.length, currentFare: 0, draftFare: 0, currentCommission: 0, draftCommission: 0 };
    for (const o of recent) {
      const fare = o.fare?.final || o.fare?.estimated || 0;
      const night = !!(o.fare?.breakdown?.night ?? legacyBreakdown(o).night);
      const d = computeFare(draft, { distanceKm: o.fare?.distance || 0, parcel: o.parcel || {}, night });
      impact.currentFare += fare;
      impact.currentCommission += expectedCommissionPaise(o, Math.round(fare * 100), current.commissionPercent) / 100;
      impact.draftFare += d.estimated;
      impact.draftCommission += d.commission;
    }

    res.json(success('Preview', {
      error: null,
      samples,
      quote: { current: computeFare(current, trip), draft: computeFare(draft, trip) },
      impact,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { getCommission, getPricingAdmin, updatePricing, previewPricing };
