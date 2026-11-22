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

// Poore route ki doori: pickup → stop1 → stop2 → … → final delivery (har leg jodo)
function routeKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return km;
}

// { estimated, riderEarning, distance, commission, commissionPercent, pricingVersion, breakdown }
// stops = beech ke stops ke coordinates ({lat,lng}[]), final delivery alag.
async function calculateFare({ pickup, delivery, stops = [], parcel = {} }) {
  const cfg = await getPricing();
  const distanceKm = routeKm([pickup, ...stops, delivery]);
  return computeFare(cfg, { distanceKm, parcel, stopCount: stops.length });
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

module.exports = { calculateFare, haversineKm, routeKm, fareSnapshot };
