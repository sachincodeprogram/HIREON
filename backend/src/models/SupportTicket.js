const mongoose = require('mongoose');

const CATEGORIES = ['order_issue', 'payment', 'wallet', 'behaviour', 'account', 'app_bug', 'other'];
const STATUSES   = ['open', 'in_progress', 'resolved', 'closed'];

const messageSchema = new mongoose.Schema({
  sender:    { type: String, enum: ['user', 'support', 'system'], required: true },
  text:      { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

// Rider/customer ki support request — app ke chat se banti hai, admin panel
// me dikhti hai. ticketNo user ko dikhaya jaata hai (TKT-100001).
const supportTicketSchema = new mongoose.Schema({
  ticketNo:  { type: String, unique: true, required: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role:      { type: String, enum: ['customer', 'rider'], required: true },
  category:  { type: String, enum: CATEGORIES, required: true },
  // Kis order ke baare me (optional) — admin seedha order khol sake
  order:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  orderCode: { type: String, default: '' },
  status:    { type: String, enum: STATUSES, default: 'open', index: true },
  messages:  { type: [messageSchema], default: [] },
  // Kis side ka naya message dusri side ne abhi nahi dekha
  adminUnread: { type: Boolean, default: true },
  userUnread:  { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  resolvedAt:    { type: Date, default: null },
  platform:      { type: String, default: '' },
  appVersion:    { type: String, default: '' },
}, { timestamps: true });

supportTicketSchema.statics.CATEGORIES = CATEGORIES;
supportTicketSchema.statics.STATUSES   = STATUSES;

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
