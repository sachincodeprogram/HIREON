const { auth } = require('../config/firebase');
const User     = require('../models/User');
const { success, error } = require('../utils/apiResponse');

// POST /api/v1/auth/register
// Body: { name, phone, role, vehicleType?, vehicleNumber? }
// Header: Authorization: Bearer <Firebase ID Token>
const register = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    let firebaseUid, email, picture;

    // Dev mode bypass: Bearer dev:<phone>
    if (process.env.NODE_ENV === 'development' && token?.startsWith('dev:')) {
      const phone = token.slice(4);
      firebaseUid = `dev_${phone}`;
      email   = '';
      picture = '';
    } else {
      const decoded = await auth().verifyIdToken(token);
      firebaseUid = decoded.uid;
      email   = decoded.email   || '';
      picture = decoded.picture || '';
    }

    const existing = await User.findOne({ firebaseUid });
    if (existing) return res.json(success('Already registered', existing));

    const { name, phone, role, vehicleType, vehicleNumber } = req.body;
    if (!name || !role) return res.status(400).json(error('name and role are required'));
    if (!['customer', 'rider'].includes(role)) return res.status(400).json(error('Invalid role'));

    const user = await User.create({
      firebaseUid,
      email,
      name:         name.trim(),
      phone:        phone || '',
      avatar:       picture,
      role,
      vehicleType:  role === 'rider' ? (vehicleType || '') : '',
      vehicleNumber: role === 'rider' ? (vehicleNumber || '') : '',
    });

    res.status(201).json(success('Registration successful', user));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  res.json(success('Profile fetched', req.user));
};

// PUT /api/v1/auth/profile
const updateProfile = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'avatar', 'vehicleType', 'vehicleNumber'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json(success('Profile updated', updated));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { register, getMe, updateProfile };
