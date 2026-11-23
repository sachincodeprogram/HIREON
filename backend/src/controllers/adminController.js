const mongoose      = require('mongoose');
const User          = require('../models/User');
const Order         = require('../models/Order');
const RiderLocation = require('../models/RiderLocation');
const WalletTransaction = require('../models/WalletTransaction');
const { success, error } = require('../utils/apiResponse');
const { getActivitySince } = require('../utils/activityLog');
const { settleDelivery } = require('../utils/deliverOrder');
const { istStarts } = require('../utils/istTime');

// GET /api/v1/admin/stats
const getStats = async (req, res) => {
  try {
    const [users, riders, customers, orders, activeOrders, todayRevenue] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'rider' }),
      User.countDocuments({ role: 'customer' }),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['pending', 'accepted', 'picked_up', 'in_transit'] } }),
      Order.aggregate([
        // deliveredAt (updatedAt nahi — kal delivered order ko aaj rating mile to woh aaj
        // ki kamai me gin jaata tha), aur din IST ke hisaab se (server UTC me hai)
        { $match: { status: 'delivered', deliveredAt: { $gte: istStarts().today } } },
        { $group: { _id: null, total: { $sum: '$fare.final' } } },
      ]),
    ]);

    res.json(success('Stats fetched', {
      users: { total: users, riders, customers },
      orders: { total: orders, active: activeOrders },
      todayRevenue: todayRevenue[0]?.total || 0,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// page/limit query ko safe numbers me badlo — limit ki had 1000, taaki ek request
// live DB se lakhon documents na kheench sake.
const MAX_LIMIT = 1000;
const paging = (q) => {
  const page  = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), MAX_LIMIT);
  return { page, limit };
};

// GET /api/v1/admin/orders
const getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const { page, limit } = paging(req.query);
    const query = status ? { status: String(status) } : {};
    const orders = await Order.find(query)
      .select('-pickupOtp -deliveryOtp')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customer', 'name email phone')
      .populate('rider', 'name email phone vehicleType vehicleNumber')
      .lean();
    const total = await Order.countDocuments(query);
    res.json(success('Orders fetched', { orders, total, page, pages: Math.ceil(total / limit) }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// Rider "sach me online" hai ya nahi — Live map wala hi rule: duty ON + block nahi +
// (socket connected YA pichhle 5 min me GPS aaya). Sirf isOnline flag pe bharosa nahi —
// app kill/uninstall hone par wo true hi reh jaata hai aur online count galat dikhta hai.
const LIVE_STALE_MS = 5 * 60 * 1000;
const attachPresence = async (users, onlineRiders) => {
  const riders = users.filter(u => u.role === 'rider');
  if (!riders.length) return;
  const locs = await RiderLocation.find({ rider: { $in: riders.map(r => r._id) } }).select('rider updatedAt').lean();
  const seenBy = new Map(locs.map(l => [l.rider.toString(), l.updatedAt]));
  const connected = onlineRiders || new Map();
  const now = Date.now();
  for (const r of riders) {
    const id = r._id.toString();
    const seen = seenBy.get(id) || null;
    const fresh = !!seen && now - new Date(seen).getTime() <= LIVE_STALE_MS;
    r.lastSeenAt = seen;
    r.live = !!r.isOnline && !r.isBlocked && !r.deletedAt && (connected.has(id) || fresh);
  }
};

// GET /api/v1/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const { page, limit } = paging(req.query);
    const query = role ? { role: String(role) } : {};
    const users = await User.find(query)
      .select('-fcmToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const total = await User.countDocuments(query);
    await attachPresence(users, req.onlineRiders);
    res.json(success('Users fetched',{ users, total, page, pages: Math.ceil(total / limit) }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

const ACTIVE_STATUSES = ['pending', 'accepted', 'picked_up', 'in_transit'];

// User ke saare live socket connections band karo (block ke turant baad)
const disconnectUser = (io, onlineRiders, userId) => {
  const id = userId.toString();
  if (onlineRiders?.has(id)) onlineRiders.delete(id);
  if (!io) return;
  for (const s of io.sockets.sockets.values()) {
    if (s.user?._id?.toString() === id) s.disconnect(true);
  }
};

// PATCH /api/v1/admin/users/:id/block   Body: { reason }
const blockUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json(error('Invalid user id'));
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json(error('Please give a reason for blocking (min 3 characters)'));
    if (reason.length > 500) return res.status(400).json(error('Reason is too long (max 500 characters)'));

    const existing = await User.findById(req.params.id).select('deletedAt isBlocked').lean();
    if (!existing) return res.status(404).json(error('User not found'));
    if (existing.deletedAt) return res.status(400).json(error('This account has been deleted'));
    if (existing.isBlocked) return res.status(409).json(error('User is already blocked'));

    // Atomic update (user.save() nahi) — save() poore document ko validate karta
    // hai, kisi purane user ka koi field galat ho to block hi fail ho jaata.
    // isOnline:false = rider duty se hate, naye orders na milein (customer par asar nahi).
    const at   = new Date();
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isBlocked: { $ne: true } },
      {
        $set:  { isBlocked: true, blockedAt: at, blockReason: reason, isOnline: false },
        $push: { blockHistory: { action: 'block', reason, at } },
      },
      { new: true, projection: { fcmToken: 0 } },
    ).lean();
    if (!user) return res.status(409).json(error('User is already blocked'));

    disconnectUser(req.io, req.onlineRiders, user._id);

    const activeOrders = await Order.countDocuments({
      $or: [{ customer: user._id }, { rider: user._id }],
      status: { $in: ACTIVE_STATUSES },
    });

    console.log(`[admin] BLOCK user=${user._id} role=${user.role} reason="${reason}"`);
    res.json(success('User blocked', { user, activeOrders }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// PATCH /api/v1/admin/users/:id/unblock   Body: { reason? }
const unblockUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json(error('Invalid user id'));
    const reason = String(req.body?.reason || '').trim().slice(0, 500);

    const existing = await User.findById(req.params.id).select('isBlocked').lean();
    if (!existing) return res.status(404).json(error('User not found'));
    if (!existing.isBlocked) return res.status(409).json(error('User is not blocked'));

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, isBlocked: true },
      {
        $set:  { isBlocked: false, blockedAt: null, blockReason: '' },
        $push: { blockHistory: { action: 'unblock', reason, at: new Date() } },
      },
      { new: true, projection: { fcmToken: 0 } },
    ).lean();
    if (!user) return res.status(409).json(error('User is not blocked'));

    console.log(`[admin] UNBLOCK user=${user._id} role=${user.role} reason="${reason}"`);
    res.json(success('User unblocked', { user }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/admin/live — live map: active orders + on-duty riders ki last location
const getLive = async (req, res) => {
  try {
    const orders = await Order.find({ status: { $in: ACTIVE_STATUSES } })
      .select('-pickupOtp -deliveryOtp')
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('customer', 'name phone')
      .populate('rider', 'name phone vehicleType vehicleNumber')
      .lean();

    const busyRiderIds = orders.filter(o => o.rider).map(o => o.rider._id);
    const riders = await User.find({
      role: 'rider',
      deletedAt: null,
      $or: [{ isOnline: true }, { _id: { $in: busyRiderIds } }],
    }).select('name phone avatar vehicleType vehicleNumber isOnline isBlocked rating').lean();

    const locs = await RiderLocation.find({ rider: { $in: riders.map(r => r._id) } }).lean();
    const locBy = new Map(locs.map(l => [l.rider.toString(), l]));
    const connected = req.onlineRiders || new Map();

    res.json(success('Live data', {
      serverTime: new Date(),
      orders,
      riders: riders.map(r => {
        const l = locBy.get(r._id.toString());
        return {
          ...r,
          connected: connected.has(r._id.toString()),
          location: l ? { lat: l.lat, lng: l.lng, heading: l.heading, speed: l.speed, updatedAt: l.updatedAt } : null,
        };
      }),
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/admin/activity?since=<ISO>&limit=<n>
// Live Activity feed — order timeline, naye signup, block/unblock aur rider online/offline
// ko ek list me jodo (naya sabse upar). Sirf padhta hai; DB me kuch nahi likhta.
const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const getActivity = async (req, res) => {
  try {
    const now   = Date.now();
    const asked = req.query.since ? new Date(String(req.query.since)) : null;
    // since na ho / galat ho / bahut purana ho to pichhle 24 ghante; 7 din se zyada peeche nahi
    let since = asked && !isNaN(asked) ? asked : new Date(now - 24 * 60 * 60 * 1000);
    if (since.getTime() < now - ACTIVITY_WINDOW_MS) since = new Date(now - ACTIVITY_WINDOW_MS);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);

    const [orders, signups, moderated, credits] = await Promise.all([
      Order.find({ updatedAt: { $gte: since } })
        .select('orderId status timeline fare paymentMethod cancelledBy pickup.address delivery.address customer rider')
        .sort({ updatedAt: -1 })
        .limit(300)
        .populate('customer', 'name')
        .populate('rider', 'name')
        .lean(),
      User.find({ createdAt: { $gte: since } }).select('name role createdAt').sort({ createdAt: -1 }).limit(limit).lean(),
      User.find({ 'blockHistory.at': { $gte: since } }).select('name role blockHistory').limit(limit).lean(),
      WalletTransaction.find({ source: { $in: ['admin', 'referral'] }, createdAt: { $gte: since } })
        .select('rider amount balanceAfter adminCategory description createdAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('rider', 'name role')
        .lean(),
    ]);

    const events = [];
    for (const o of orders) {
      const order = {
        _id: o._id, orderId: o.orderId, status: o.status, fare: o.fare, paymentMethod: o.paymentMethod,
        pickup: o.pickup?.address || '', delivery: o.delivery?.address || '',
        customer: o.customer ? { _id: o.customer._id, name: o.customer.name } : null,
        rider: o.rider ? { _id: o.rider._id, name: o.rider.name } : null,
      };
      (o.timeline || []).forEach((t, i) => {
        if (!t.timestamp || t.timestamp < since) return;
        events.push({ id: `o:${o._id}:${i}`, type: 'order', status: t.status, note: t.note || '', at: t.timestamp, order });
      });
    }
    for (const u of signups) {
      events.push({ id: `s:${u._id}`, type: 'signup', at: u.createdAt, user: { _id: u._id, name: u.name, role: u.role } });
    }
    for (const u of moderated) {
      (u.blockHistory || []).forEach((b, i) => {
        if (!b.at || b.at < since) return;
        events.push({ id: `b:${u._id}:${i}`, type: b.action, reason: b.reason || '', at: b.at, user: { _id: u._id, name: u.name, role: u.role } });
      });
    }
    for (const t of credits) {
      events.push({
        id: `w:${t._id}`, type: 'wallet_credit', at: t.createdAt, amount: t.amount, category: t.adminCategory,
        reason: t.description || '', user: t.rider ? { _id: t.rider._id, name: t.rider.name, role: t.rider.role } : undefined,
      });
    }
    getActivitySince(since).forEach((e) => {
      events.push({ id: `m:${e.type}:${e.user?._id}:${e.at.getTime()}`, ...e });
    });

    events.sort((a, b) => new Date(b.at) - new Date(a.at));
    res.json(success('Activity', { serverTime: new Date(now), since, events: events.slice(0, limit) }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/admin/orders/:id/mark-delivered — rider ne parcel de diya par app me
// confirm nahi ho paya (jaise COD swipe bug) to admin order complete kar sakta hai.
// Rider ke OTP+swipe wala hi settleDelivery chalta hai: rider stats, COD commission
// debit / ONLINE earning credit, referral — sab ek hi baar (idempotent).
// Sirf picked_up / in_transit — accepted order me parcel abhi uthaya hi nahi gaya.
const markDelivered = async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (reason.length < 3) return res.status(400).json(error('Reason is required'));
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json(error('Order not found'));

    const found = await Order.findById(req.params.id);
    if (!found) return res.status(404).json(error('Order not found'));
    if (!found.rider) return res.status(400).json(error('No rider is assigned to this order'));
    if (found.status === 'delivered') return res.status(400).json(error('Order is already delivered'));
    if (!['picked_up', 'in_transit'].includes(found.status)) {
      return res.status(400).json(error('Only picked-up orders can be marked delivered (current: ' + found.status + ')'));
    }

    const { order, changed } = await settleDelivery({
      found,
      note: 'Marked delivered by admin: ' + reason,
      fromStatuses: ['picked_up', 'in_transit'],
      io: req.io,
    });
    if (!order) return res.status(400).json(error('Order cannot be delivered at this stage'));
    if (!changed) return res.status(400).json(error('Order is already delivered'));

    const full = await Order.findById(order._id)
      .select('-pickupOtp -deliveryOtp')
      .populate('customer', 'name email phone')
      .populate('rider', 'name email phone vehicleType vehicleNumber')
      .lean();
    res.json(success('Order marked delivered', full));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { getStats, getAllOrders, getAllUsers, blockUser, unblockUser, getLive, getActivity, markDelivered };
