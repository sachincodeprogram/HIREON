const { getPricing, computeFare } = require('./pricing');

// Rate ab admin panel se aate hain (utils/pricing.js + PricingConfig) — yahan hardcode nahi.

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// { estimated, riderEarning, distance, commission, commissionPercent, pricingVersion, breakdown }
async function calculateFare({ pickup, delivery, parcel = {} }) {
  const cfg = await getPricing();
  const distanceKm = haversineKm(pickup.lat, pickup.lng, delivery.lat, delivery.lng);
  return computeFare(cfg, { distanceKm, parcel });
}

// Order par save hone wala snapshot (fare.*)
const fareSnapshot = f => ({
  estimated: f.estimated,
  final: f.estimated,
  distance: f.distance,
  commissionPercent: f.commissionPercent,
  commission: f.commission,
  pricingVersion: f.pricingVersion,
  breakdown: f.breakdown,
});

module.exports = { calculateFare, haversineKm, fareSnapshot };
