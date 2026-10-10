const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email:        { type: String, required: false, default: '', lowercase: true },
  name:         { type: String, required: true },
  phone:        { type: String, default: '' },
  avatar:       { type: String, default: '' },
  role:         { type: String, enum: ['customer', 'rider'], required: true },

  // FCM device token — screen lock/app background me push bhejne ke liye
  fcmToken:     { type: String, default: '' },

  // Rider-only fields
  vehicleType:       { type: String, default: '' },
  vehicleNumber:     { type: String, default: '' },
  isOnline:          { type: Boolean, default: false },
  totalEarnings:     { type: Number, default: 0 },
  totalDeliveries:   { type: Number, default: 0 },
  rating:            { type: Number, default: 5.0, min: 1, max: 5 },
  ratingCount:       { type: Number, default: 0 },

  deletedAt:         { type: Date, default: null },

  // Admin moderation — complaint aane par account block. Blocked user sirf apni
  // profile (GET /auth/me) dekh sakta hai, baaki sab API/socket band.
  // Index jaan-boojh kar nahi — deploy par live DB me index build na ho. Queries
  // role/isOnline par filter karti hain, isBlocked sirf extra condition hai.
  isBlocked:    { type: Boolean, default: false },
  blockedAt:    { type: Date, default: null },
  blockReason:  { type: String, default: '' },
  // Audit trail — kab, kyun block/unblock hua
  blockHistory: [{
    _id:    false,
    action: { type: String, enum: ['block', 'unblock'], required: true },
    reason: { type: String, default: '' },
    at:     { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
