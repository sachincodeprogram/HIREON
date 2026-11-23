const { auth } = require('../config/firebase');
const mongoose = require('mongoose');
const User     = require('../models/User');
const Order    = require('../models/Order');

// Map: firebaseUid → socketId
const onlineRiders = new Map();

const registerSocketHandlers = (io) => {
  io.use(async (socket, next) => {
    try {
      const token   = socket.handshake.auth.token;

      // Dev mode bypass: token "dev:<phone>" — same as REST middleware
      if (process.env.NODE_ENV === 'development' && token && token.startsWith('dev:')) {
        const phone = token.slice(4);
        const user  = await User.findOne({ phone });
        if (!user) return next(new Error('User not found'));
        if (user.isBlocked) return next(new Error('Account blocked'));
        socket.user = user;
        return next();
      }

      const decoded = await auth().verifyIdToken(token);
      const user    = await User.findOne({ firebaseUid: decoded.uid });
      if (!user) return next(new Error('User not found'));
      if (user.isBlocked) return next(new Error('Account blocked'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;

    if (user.role === 'rider') {
      onlineRiders.set(user._id.toString(), socket.id);
    }

    // Room sirf order ka customer ya assigned rider join kar sakta hai — pehle koi bhi
    // logged-in user kisi bhi order ID se room me ghus kar rider ki live location aur
    // order updates dekh sakta tha (aur fake rider_location bhej sakta tha).
    const joinIfAllowed = async (orderId, field) => {
      try {
        if (!mongoose.isValidObjectId(orderId)) return;
        const order = await Order.findById(orderId).select('customer rider').lean();
        if (order && String(order[field]) === user._id.toString()) socket.join(String(orderId));
      } catch { /* galat id / DB glitch — join mat karo */ }
    };

    // Customer starts tracking an order
    socket.on('track_order', (orderId) => { joinIfAllowed(orderId, 'customer'); });

    // Rider joins the order room (when they accept it)
    socket.on('join_order', (orderId) => { joinIfAllowed(orderId, 'rider'); });

    // Rider broadcasts location — sirf usi room me jisme woh assigned rider ban kar join hua
    socket.on('rider_location', (data) => {
      const { orderId, lat, lng, heading } = data || {};
      if (user.role !== 'rider' || !orderId || !socket.rooms.has(String(orderId))) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      socket.to(String(orderId)).emit('rider_location', { lat, lng, heading });
    });

    socket.on('disconnect', () => {
      // Sirf tabhi offline karo jab YEHI socket map me ho — rider ke naye
      // connection (reconnect) ke baad purane socket ka late disconnect
      // rider ko galti se offline kar deta tha, phir order ping nahi milte.
      if (user.role === 'rider' && onlineRiders.get(user._id.toString()) === socket.id) {
        onlineRiders.delete(user._id.toString());
      }
    });
  });

  return { onlineRiders };
};

module.exports = { registerSocketHandlers, onlineRiders };
