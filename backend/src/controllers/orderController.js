const Order          = require('../models/Order');
const User           = require('../models/User');
const RiderLocation  = require('../models/RiderLocation');
const { calculateFare, haversineKm } = require('../utils/fareCalculator');
const { dispatchOrder, cancelDispatch } = require('../utils/dispatch');
const { success, error } = require('../utils/apiResponse');

const genOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

// Socket payload jo riders ko bheja jata hai (create + redispatch dono yahi use karte hain).
const buildOrderPayload = (order) => ({
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
});

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

    // Tiered radius dispatch: 1km -> 3km -> 5km tak nearest riders ko bhejo.
    dispatchOrder(req.io, req.onlineRiders, {
      orderId: order._id,
      pickup:  order.pickup.coordinates,
      payload: buildOrderPayload(order),
    });

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

// GET /api/v1/orders/pending  (rider sees today's open requests only — purane stale orders nahi)
const getPendingOrders = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await Order.find({ status: 'pending', rider: null, createdAt: { $gte: todayStart } })
      .sort({ createdAt: -1 }).limit(20)
      .populate('customer', 'name phone avatar');
    res.json(success('Pending orders', orders));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/orders/:id/nearby-riders  — pickup ke 5km ke andar online riders (map ke liye)
const getNearbyRiders = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('pickup customer');
    if (!order) return res.status(404).json(error('Order not found'));

    const pickup = order.pickup?.coordinates;
    const riderIds = Array.from(req.onlineRiders?.keys() || []);
    if (!pickup || riderIds.length === 0) return res.json(success('Nearby riders', []));

    const locs = await RiderLocation.find({ rider: { $in: riderIds } }).lean();
    const nearby = locs
      .map((loc) => ({ lat: loc.lat, lng: loc.lng, km: haversineKm(pickup.lat, pickup.lng, loc.lat, loc.lng) }))
      .filter((r) => r.km <= 5)
      .map((r) => ({ lat: r.lat, lng: r.lng }));   // identity expose mat karo, sirf dots

    res.json(success('Nearby riders', nearby));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/orders/:id/redispatch  — "Order Again": pending order ko dobara dispatch karo
const redispatchOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json(error('Order not found'));
    if (order.customer.toString() !== req.user._id.toString()) return res.status(403).json(error('Not your order'));
    if (order.status !== 'pending') return res.status(400).json(error('Order is no longer pending'));

    dispatchOrder(req.io, req.onlineRiders, {
      orderId: order._id,
      pickup:  order.pickup.coordinates,
      payload: buildOrderPayload(order),
    });

    res.json(success('Order re-dispatched', order));
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
    cancelDispatch(order._id); // accept ho gaya — baaki tiers ko ring mat karo

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
    cancelDispatch(order._id); // cancel ho gaya — dispatch rok do

    req.io?.to(order._id.toString()).emit('order_update', { status: 'cancelled' });
    res.json(success('Order cancelled', order));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { estimateFare, createOrder, getOrders, getOrder, getPendingOrders, getNearbyRiders, redispatchOrder, acceptOrder, confirmPickup, confirmDelivery, cancelOrder };
