const BASE_FARE       = 30;   // ₹
const PER_KM_RATE     = 10;   // ₹/km
const WEIGHT_LIMIT    = 1;    // kg free
const WEIGHT_RATE     = 5;    // ₹/kg above limit
const FRAGILE_CHARGE  = 20;   // ₹
const SIZE_CHARGES    = { small: 0, medium: 15, large: 30 };
const NIGHT_MULTIPLIER = 1.2; // 10pm–6am
const PLATFORM_CUT    = 0.20; // 20%

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

function calculateFare({ pickup, delivery, parcel = {} }) {
  const { lat: lat1, lng: lng1 } = pickup;
  const { lat: lat2, lng: lng2 } = delivery;
  const distance = Math.max(haversineKm(lat1, lng1, lat2, lng2), 0.5);

  let fare = BASE_FARE + distance * PER_KM_RATE;

  const weight = parcel.weight || 1;
  if (weight > WEIGHT_LIMIT) fare += (weight - WEIGHT_LIMIT) * WEIGHT_RATE;
  if (parcel.isFragile) fare += FRAGILE_CHARGE;
  fare += SIZE_CHARGES[parcel.size] || 0;

  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) fare *= NIGHT_MULTIPLIER;

  const estimated = Math.round(fare);
  const riderEarning = Math.round(estimated * (1 - PLATFORM_CUT));

  return { estimated, riderEarning, distance: parseFloat(distance.toFixed(2)) };
}

module.exports = { calculateFare, haversineKm };
