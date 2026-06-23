const Order          = require('../models/Order');
const User           = require('../models/User');
const { calculateFare } = require('../utils/fareCalculator');
const { success, error } = require('../utils/apiResponse');

const genOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

// POST /api/v1/orders/estimate
const estimateFare = async (req, res) => {
  try {
    const { pickup, delivery, parcel } = req.body;
    if (!pickup?.lat || !pickup?.lng || !delivery?.lat || !delivery?.lng) {
      return res.status(400).json(error('pickup and delivery coordinates required'));
    }
    const result = calculateFare({ pickup, delivery, parcel });
    res.json(success('Fare estimated', result));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders
const createOrder = async (req, res) => {
  try {
    const { pickup, delivery, parcel } = req.body;
    if (!pickup || !delivery) return res.status(400).json(error('pickup and delivery required'));

    const { estimated, riderEarning, distance } = calculateFare({ pickup: pickup.coordinates, delivery: delivery.coordinates, parcel });

    const order = await Order.create({
      customer: req.user._id,
      pickup,
      delivery,
      parcel:   parcel || {},
      fare:     { estimated, final: estimated, distance },
      status:   'pending',
      pickupOtp:   genOtp(),
      deliveryOtp: genOtp(),
      timeline: [{ status: 'pending', note: 'Order placed' }],
      riderEarning,
    });

    // Notify only online riders via socket (not all sockets)
    const orderPayload = {
      _id:          order._id.toString(),
      orderId:      order.orderId,
      pickup:       order.pickup,
      delivery:     order.delivery,
      fare:         order.fare,          // full object: { estimated, final, distance }
      riderEarning: order.riderEarning,
      parcel:       order.parcel,
      status:       order.status,
      createdAt:    order.createdAt,
      updatedAt:    order.updatedAt,
    };

    const io = req.io;
    const onlineRiders = req.onlineRiders;
    if (io && onlineRiders && onlineRiders.size > 0) {
      onlineRiders.forEach((socketId) => {
        io.to(socketId).emit('new_order_request', orderPayload);
      });
    } else if (io) {
      io.emit('new_order_request', orderPayload);
    }

    res.status(201).json(success('Order placed', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/orders  (customer: own orders | rider: assigned orders)
const getOrders = async (req, res) => {
  try {
    const query = req.user.role === 'customer'
      ? { customer: req.user._id }
      : { rider: req.user._id };
    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(50)
      .populate('customer', 'name phone avatar')
      .populate('rider', 'name phone avatar vehicleType vehicleNumber rating');
    res.json(success('Orders fetched', orders));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/orders/:id
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone avatar')
      .populate('rider', 'name phone avatar vehicleType vehicleNumber rating');
    if (!order) return res.status(404).json(error('Order not found'));
    res.json(success('Order fetched', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/orders/pending  (rider sees all pending orders)
const getPendingOrders = async (req, res) => {
  try {
    const orders = await Order.find({ status: 'pending', rider: null })
      .sort({ createdAt: -1 }).limit(20)
      .populate('customer', 'name phone avatar');
    res.json(success('Pending orders', orders));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders/:id/accept
const acceptOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json(error('Order not found'));
    if (order.status !== 'pending') return res.status(400).json(error('Order no longer available'));

    order.rider  = req.user._id;
    order.status = 'accepted';
    order.timeline.push({ status: 'accepted', note: 'Rider accepted the order' });
    await order.save();

    await order.populate('rider', 'name phone avatar vehicleType vehicleNumber rating');

    req.io?.to(order._id.toString()).emit('order_update', { status: 'accepted', rider: order.rider, pickupOtp: order.pickupOtp });

    res.json(success('Order accepted', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders/:id/pickup  — rider confirms pickup with OTP
const confirmPickup = async (req, res) => {
  try {
    const { otp } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json(error('Order not found'));
    if (order.rider?.toString() !== req.user._id.toString()) return res.status(403).json(error('Not your order'));
    if (order.pickupOtp !== otp) return res.status(400).json(error('Invalid OTP'));

    order.status = 'picked_up';
    order.timeline.push({ status: 'picked_up', note: 'Parcel picked up' });
    await order.save();

    req.io?.to(order._id.toString()).emit('order_update', { status: 'picked_up', deliveryOtp: order.deliveryOtp });
    res.json(success('Pickup confirmed', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders/:id/deliver  — rider confirms delivery with OTP
const confirmDelivery = async (req, res) => {
  try {
    const { otp } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json(error('Order not found'));
    if (order.rider?.toString() !== req.user._id.toString()) return res.status(403).json(error('Not your order'));
    if (order.deliveryOtp !== otp) return res.status(400).json(error('Invalid OTP'));

    order.status = 'delivered';
    order.deliveredAt = new Date();
    order.fare.final = order.fare.estimated;
    order.timeline.push({ status: 'delivered', note: 'Parcel delivered successfully' });
    await order.save();

    // Update rider stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalEarnings: order.riderEarning, totalDeliveries: 1 },
    });

    req.io?.to(order._id.toString()).emit('order_update', { status: 'delivered' });
    res.json(success('Delivery confirmed', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders/:id/cancel
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json(error('Order not found'));

    const cancellableStatuses = ['pending', 'accepted'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json(error('Cannot cancel at this stage'));
    }

    order.status          = 'cancelled';
    order.cancelledBy     = req.user.role;
    order.cancellationNote = req.body.note || '';
    order.timeline.push({ status: 'cancelled', note: req.body.note || 'Order cancelled' });
    await order.save();

    req.io?.to(order._id.toString()).emit('order_update', { status: 'cancelled' });
    res.json(success('Order cancelled', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { estimateFare, createOrder, getOrders, getOrder, getPendingOrders, acceptOrder, confirmPickup, confirmDelivery, cancelOrder };
