const Order         = require('../models/Order');
const RiderLocation = require('../models/RiderLocation');
const { haversineKm } = require('./fareCalculator');

// Tiered radius dispatch — Dunzo/Porter style. Pehle paas wale riders ko bhejo,
// koi accept na kare to ring badha do: 1km -> 3km -> 5km. Har tier ko 1:30 min.
const TIERS = [
  { radiusKm: 1, delayMs: 0 },        // 0:00 - 1:30  -> 1km ke andar
  { radiusKm: 3, delayMs: 90000 },    // 1:30 - 3:00  -> 3km tak
  { radiusKm: 5, delayMs: 180000 },   // 3:00 - 4:30  -> 5km tak
];
// 4:30 (270s) tak bhi koi rider na le to customer ko "rider uplabdh nahi" bata do.
const NO_RIDER_MS = 270000;

// orderId(string) -> { timers: NodeJS.Timeout[], notified: Set<riderId> }
const active = new Map();

// Cancel any pending tier timers for an order (accept/cancel ho gaya).
const cancelDispatch = (orderId) => {
  const id = orderId.toString();
  const entry = active.get(id);
  if (!entry) return;
  entry.timers.forEach(clearTimeout);
  active.delete(id);
};

// Notify online riders within `radiusKm` of pickup who haven't been pinged yet.
const notifyTier = async (io, onlineRiders, { id, pickup, payload }, radiusKm, entry) => {
  // Order abhi bhi pending hai? warna ruk jao.
  const fresh = await Order.findById(id).select('status');
  if (!fresh || fresh.status !== 'pending') { cancelDispatch(id); return; }

  const riderIds = Array.from(onlineRiders.keys());
  if (riderIds.length === 0) return;

  const locs = await RiderLocation.find({ rider: { $in: riderIds } }).lean();
  locs.forEach((loc) => {
    const rid = loc.rider.toString();
    if (entry.notified.has(rid)) return;                 // pehle hi ping kar diya
    const km = haversineKm(pickup.lat, pickup.lng, loc.lat, loc.lng);
    if (km <= radiusKm) {
      const socketId = onlineRiders.get(rid);
      if (socketId) {
        io.to(socketId).emit('new_order_request', payload);
        entry.notified.add(rid);
      }
    }
  });
};

// 4:30 baad bhi pending -> customer ke order room me "no rider" bhejo.
const notifyNoRider = async (io, id) => {
  const fresh = await Order.findById(id).select('status');
  if (!fresh || fresh.status !== 'pending') { cancelDispatch(id); return; }
  io.to(id.toString()).emit('order_no_rider', { orderId: id.toString() });
  cancelDispatch(id);
};

// Kick off tiered dispatch for a freshly created (ya re-dispatch hue) order.
const dispatchOrder = (io, onlineRiders, { orderId, pickup, payload }) => {
  if (!io || !onlineRiders || !pickup) return;
  const id = orderId.toString();
  cancelDispatch(id); // safety: purane timers saaf karo
  const entry = { timers: [], notified: new Set() };
  active.set(id, entry);

  TIERS.forEach(({ radiusKm, delayMs }) => {
    const t = setTimeout(() => {
      notifyTier(io, onlineRiders, { id, pickup, payload }, radiusKm, entry).catch(() => {});
    }, delayMs);
    entry.timers.push(t);
  });

  const noRiderTimer = setTimeout(() => {
    notifyNoRider(io, id).catch(() => {});
  }, NO_RIDER_MS);
  entry.timers.push(noRiderTimer);
};

module.exports = { dispatchOrder, cancelDispatch };
