const mongoose      = require('mongoose');
const User          = require('../models/User');
const Order         = require('../models/Order');
const RiderLocation = require('../models/RiderLocation');
const { success, error } = require('../utils/apiResponse');

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
        { $match: { status: 'delivered', updatedAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } },
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

// GET /api/v1/admin/orders
const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('customer', 'name email phone')
      .populate('rider', 'name email phone vehicleType vehicleNumber');
    const total = await Order.countDocuments(query);
    res.json(success('Orders fetched', { orders, total, page: Number(page), pages: Math.ceil(total / limit) }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const query = role ? { role } : {};
    const users = await User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    const total = await User.countDocuments(query);
    res.json(success('Users fetched', { users, total, page: Number(page), pages: Math.ceil(total / limit) }));
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

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json(error('User not found'));
    if (user.deletedAt) return res.status(400).json(error('This account has been deleted'));
    if (user.isBlocked) return res.status(409).json(error('User is already blocked'));

    user.isBlocked   = true;
    user.blockedAt   = new Date();
    user.blockReason = reason;
    user.blockHistory.push({ action: 'block', reason, at: user.blockedAt });
    // Rider ko duty se hatao taaki naye orders na milein
    if (user.role === 'rider') user.isOnline = false;
    await user.save();

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

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json(error('User not found'));
    if (!user.isBlocked) return res.status(409).json(error('User is not blocked'));

    user.isBlocked   = false;
    user.blockedAt   = null;
    user.blockReason = '';
    user.blockHistory.push({ action: 'unblock', reason, at: new Date() });
    await user.save();

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

module.exports = { getStats, getAllOrders, getAllUsers, blockUser, unblockUser, getLive };
