const { auth } = require('../config/firebase');
const User     = require('../models/User');

const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  const token = header.split(' ')[1];

  // Dev mode bypass: Bearer dev:<phone>
  if (process.env.NODE_ENV === 'development' && token.startsWith('dev:')) {
    try {
      const phone = token.slice(4);
      const user  = await User.findOne({ phone });
      if (!user) return res.status(404).json({ success: false, message: 'User profile not found. Please complete signup.' });
      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Dev token lookup failed' });
    }
  }

  try {
    const decoded = await auth().verifyIdToken(token);
    const user    = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) return res.status(404).json({ success: false, message: 'User profile not found. Please complete signup.' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access forbidden' });
  }
  next();
};

module.exports = { protect, requireRole };
