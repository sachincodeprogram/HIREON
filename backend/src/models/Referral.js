const mongoose = require('mongoose');

// Refer & Earn ka record — har naye user ke liye max ek. Rider (referrer) ne kisko
// invite kiya, code se ya link se, aur reward mila ya kyun nahi mila.
// Account delete hone par bhi yeh record rehta hai (refereeIdentity ke saath) —
// taaki koi delete karke dobara signup kare to ₹100 dobara na mile.
const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referee:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code:     { type: String, required: true },

  // 'link' = invite link se install (Play Install Referrer), 'code' = haath se code daala
  channel:  { type: String, enum: ['code', 'link'], default: 'code' },

  // Verified phone (ya Google email) — ek insaan ek hi baar reward dilaye.
  refereeIdentity: { type: String, required: true, unique: true },
  refereeName:     { type: String, default: '' },
  refereeRole:     { type: String, enum: ['customer', 'rider'], required: true },

  // joined   = dost ne signup kiya, pehle successful (delivered) order ka intezaar
  // pending  = pehla order delivered ho gaya, reward credit hona baaki (fail/retry)
  // rewarded = wallet me aa gaya
  // rejected = niyam ke bahar (monthly limit, referrer blocked/deleted)
  status:       { type: String, enum: ['joined', 'pending', 'rewarded', 'rejected'], default: 'joined' },
  rejectReason: { type: String, default: '' },
  rewardPaise:  { type: Number, default: 0 },
  // Kis order ke deliver hone par referral qualify hua
  qualifyingOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  qualifiedAt:     { type: Date, default: null },
  transaction:  { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  rewardedAt:   { type: Date, default: null },
}, { timestamps: true });

referralSchema.index({ referrer: 1, createdAt: -1 });

module.exports = mongoose.model('Referral', referralSchema);
