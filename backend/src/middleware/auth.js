const { auth } = require('../config/firebase');
const User     = require('../models/User');

// Blocked account: sirf GET /auth/me chalne do (app khul sake), baaki har request
// 403 ACCOUNT_BLOCKED — app ka apiClient yeh message seedha user ko dikhata hai.
const BLOCKED_MESSAGE = 'Your account has been blocked. Please contact HIREON support.';
const isBlockedRequest = (req, user) =>
  user.isBlocked && !(req.method === 'GET' && req.baseUrl + req.path === '/api/v1/auth/me');
const blockedResponse = (res) =>
  res.status(403).json({ success: false, message: BLOCKED_MESSAGE, data: { code: 'ACCOUNT_BLOCKED' } });

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
      if (isBlockedRequest(req, user)) return blockedResponse(res);
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
    if (isBlockedRequest(req, user)) return blockedResponse(res);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

// Sirf token verify karo, DB profile zaroori nahi — signup ke beech wale steps
// (jaise referral code check) ke liye, jab user ki profile abhi bani hi nahi.
// Dev mode me `dev:<phone>` bhi chalta hai (protect jaisa hi gate).
const decodeAuthToken = async (token) => {
  if (process.env.NODE_ENV === 'development' && token?.startsWith('dev:')) {
    const phone = token.slice(4);
    return { uid: `dev_${phone}`, phone, email: '', picture: '' };
  }
  const decoded = await auth().verifyIdToken(token);
  return {
    uid:     decoded.uid,
    phone:   decoded.phone_number || '',
    email:   decoded.email   || '',
    picture: decoded.picture || '',
  };
};

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  try {
    req.firebase = await decodeAuthToken(header.split(' ')[1]);
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

const requireRole =(...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access forbidden' });
  }
  next();
};

module.exports = { protect, verifyToken, decodeAuthToken, requireRole, BLOCKED_MESSAGE };
