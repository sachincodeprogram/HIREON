const User  = require('../models/User');
const Order = require('../models/Order');
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

module.exports = { getStats, getAllOrders, getAllUsers };
