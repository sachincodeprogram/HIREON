const SupportTicket = require('../models/SupportTicket');
const Counter       = require('../models/Counter');
const Order         = require('../models/Order');
const User          = require('../models/User');
const { success, error } = require('../utils/apiResponse');
const { sendSupportReplyPush } = require('../utils/push');

const MIN_LEN = 5;
const MAX_LEN = 2000;
const MAX_OPEN_TICKETS = 5;      // ek user ke ek saath itne hi khule ticket (spam rokne ke liye)
const MAX_MESSAGES     = 200;    // ek ticket me itne messages tak

const cleanText = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim();

const USER_FIELDS  = 'name phone email role avatar isBlocked vehicleType vehicleNumber createdAt';
const ORDER_FIELDS = 'orderId status fare pickup.address delivery.address createdAt paymentMethod';

// Ticket list ke liye halka shape — poori conversation nahi, sirf preview.
const summary = (t) => {
  const last  = t.messages[t.messages.length - 1];
  const first = t.messages.find(m => m.sender === 'user');
  return {
    _id: t._id,
    ticketNo: t.ticketNo,
    category: t.category,
    status: t.status,
    orderCode: t.orderCode,
    subject: first ? first.text.slice(0, 140) : '',
    lastMessage: last ? { sender: last.sender, text: last.text.slice(0, 140), createdAt: last.createdAt } : null,
    userUnread: t.userUnread,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
  };
};

// ─── User (customer / rider) ────────────────────────────────────────────────

// POST /api/v1/support/tickets  { category, message, orderId? }
const createTicket = async (req, res) => {
  try {
    const { category, orderId, platform, appVersion } = req.body || {};
    const message = cleanText(req.body?.message);
    if (!SupportTicket.CATEGORIES.includes(category)) return res.status(400).json(error('Please choose a topic'));
    if (message.length < MIN_LEN) return res.status(400).json(error('Please describe your problem in a few words'));
    if (message.length > MAX_LEN) return res.status(400).json(error(`Message is too long (max ${MAX_LEN} characters)`));

    const openCount = await SupportTicket.countDocuments({ user: req.user._id, status: { $in: ['open', 'in_progress'] } });
    if (openCount >= MAX_OPEN_TICKETS) {
      return res.status(429).json(error('You already have several open tickets. Please continue in an existing conversation.'));
    }

    // Order sirf tabhi jodo jab wo isi user ka ho (customer ya assigned rider)
    let order = null;
    if (orderId) {
      order = await Order.findOne({
        _id: orderId,
        $or: [{ customer: req.user._id }, { rider: req.user._id }],
      }).select('_id orderId').catch(() => null);
    }

    const seq = await Counter.next('support_ticket');
    const ticketNo = `TKT-${100000 + seq}`;
    const now = new Date();
    const ticket = await SupportTicket.create({
      ticketNo,
      user: req.user._id,
      role: req.user.role === 'rider' ? 'rider' : 'customer',
      category,
      order: order?._id || null,
      orderCode: order?.orderId || '',
      platform: String(platform || '').slice(0, 40),
      appVersion: String(appVersion || '').slice(0, 20),
      messages: [
        { sender: 'user', text: message, createdAt: now },
        { sender: 'system', text: `Ticket ${ticketNo} created`, createdAt: now },
      ],
      adminUnread: true,
      lastMessageAt: now,
    });
    res.status(201).json(success('Ticket created', ticket));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/support/tickets  — apne tickets (naye pehle)
const listMyTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id }).sort({ lastMessageAt: -1 }).limit(50);
    res.json(success('Tickets', tickets.map(summary)));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/support/tickets/:id  — poori conversation; khulte hi "read" mark
const getMyTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id }).catch(() => null);
    if (!ticket) return res.status(404).json(error('Ticket not found'));
    if (ticket.userUnread) {
      ticket.userUnread = false;
      await ticket.save();
    }
    res.json(success('Ticket', ticket));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/support/tickets/:id/messages  { message }
const addMyMessage = async (req, res) => {
  try {
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json(error('Message cannot be empty'));
    if (message.length > MAX_LEN) return res.status(400).json(error(`Message is too long (max ${MAX_LEN} characters)`));

    const ticket = await SupportTicket.findOne({ _id: req.params.id, user: req.user._id }).catch(() => null);
    if (!ticket) return res.status(404).json(error('Ticket not found'));
    if (ticket.status === 'closed') return res.status(400).json(error('This ticket is closed. Please start a new conversation.'));
    if (ticket.messages.length >= MAX_MESSAGES) return res.status(400).json(error('This conversation is too long. Please start a new one.'));

    const now = new Date();
    ticket.messages.push({ sender: 'user', text: message, createdAt: now });
    // Resolve hone ke baad user ne phir likha — ticket dobara khol do
    if (ticket.status === 'resolved') {
      ticket.status = 'open';
      ticket.resolvedAt = null;
      ticket.messages.push({ sender: 'system', text: 'Ticket reopened', createdAt: now });
    }
    ticket.adminUnread = true;
    ticket.lastMessageAt = now;
    await ticket.save();
    res.json(success('Message sent', ticket));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// ─── Admin ──────────────────────────────────────────────────────────────────

// GET /api/v1/admin/support/tickets?status=&page=&limit=
const adminListTickets = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const filter = {};
    if (SupportTicket.STATUSES.includes(req.query.status)) filter.status = req.query.status;

    const [tickets, total, counts, unread] = await Promise.all([
      SupportTicket.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('user', 'name phone role avatar isBlocked'),
      SupportTicket.countDocuments(filter),
      SupportTicket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      SupportTicket.countDocuments({ adminUnread: true, status: { $in: ['open', 'in_progress'] } }),
    ]);

    res.json(success('Support tickets', {
      tickets: tickets.map(t => ({
        ...summary(t), user: t.user, role: t.role, adminUnread: t.adminUnread, messageCount: t.messages.length,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
      counts: Object.fromEntries(counts.map(c => [c._id, c.n])),
      unread,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

const populateFull = async (ticket) => {
  await ticket.populate('user', USER_FIELDS);
  await ticket.populate('order', ORDER_FIELDS);
  return ticket;
};

// GET /api/v1/admin/support/tickets/:id  — admin ne khola = admin side read
const adminGetTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).catch(() => null);
    if (!ticket) return res.status(404).json(error('Ticket not found'));
    if (ticket.adminUnread) {
      ticket.adminUnread = false;
      await ticket.save();
    }
    res.json(success('Ticket', await populateFull(ticket)));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/admin/support/tickets/:id/reply  { message }
const adminReply = async (req, res) => {
  try {
    const message = cleanText(req.body?.message);
    if (!message) return res.status(400).json(error('Reply cannot be empty'));
    if (message.length > MAX_LEN) return res.status(400).json(error(`Reply is too long (max ${MAX_LEN} characters)`));

    const ticket = await SupportTicket.findById(req.params.id).catch(() => null);
    if (!ticket) return res.status(404).json(error('Ticket not found'));
    if (ticket.status === 'closed') return res.status(400).json(error('Ticket is closed — reopen it first'));

    const now = new Date();
    ticket.messages.push({ sender: 'support', text: message, createdAt: now });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    ticket.userUnread = true;
    ticket.adminUnread = false;
    ticket.lastMessageAt = now;
    await ticket.save();

    // User ko push — app band ho tab bhi pata chale ki support ne jawab diya.
    // Fire-and-forget: push fail ho to bhi reply save ho chuka hai.
    User.findById(ticket.user).select('fcmToken').then(u => {
      if (!u?.fcmToken) return;
      sendSupportReplyPush(u.fcmToken, ticket, message).then(result => {
        if (result === 'invalid-token') User.updateOne({ _id: ticket.user }, { fcmToken: '' }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});

    res.json(success('Reply sent', await populateFull(ticket)));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

const STATUS_NOTE = {
  open: 'Ticket reopened',
  in_progress: 'Our team is looking into this',
  resolved: 'Ticket marked as resolved',
  closed: 'Ticket closed',
};

// PATCH /api/v1/admin/support/tickets/:id/status  { status }
const adminSetStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!SupportTicket.STATUSES.includes(status)) return res.status(400).json(error('Invalid status'));
    const ticket = await SupportTicket.findById(req.params.id).catch(() => null);
    if (!ticket) return res.status(404).json(error('Ticket not found'));

    if (ticket.status !== status) {
      const now = new Date();
      ticket.status = status;
      ticket.resolvedAt = status === 'resolved' || status === 'closed' ? now : null;
      ticket.messages.push({ sender: 'system', text: STATUS_NOTE[status], createdAt: now });
      ticket.userUnread = true;
      ticket.lastMessageAt = now;
      await ticket.save();
    }
    res.json(success('Status updated', await populateFull(ticket)));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = {
  createTicket, listMyTickets, getMyTicket, addMyMessage,
  adminListTickets, adminGetTicket, adminReply, adminSetStatus,
};
