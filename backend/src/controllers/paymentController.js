const crypto = require('crypto');
const Order  = require('../models/Order');
const { creditWallet } = require('../utils/wallet');
const { dispatchOrder } = require('../utils/dispatch');
const { buildOrderPayload } = require('./orderController');

// POST /api/v1/payments/webhook — Razorpay ka authoritative server-to-server
// confirm. Route raw body (Buffer) se mount hota hai (server.js) taaki
// signature verify raw bytes par ho sake, JSON-parsed body par nahi.
const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret     = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret) return res.status(400).send('Webhook not configured');

    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    let validSignature = false;
    try {
      validSignature = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      validSignature = false;
    }
    if (!validSignature) return res.status(400).send('Invalid signature');

    const payload = JSON.parse(req.body.toString('utf8'));

    if (payload.event === 'payment.captured') {
      const payment = payload.payload.payment.entity;
      const notes   = payment.notes || {};

      if (notes.purpose === 'WALLET_RECHARGE' && notes.riderId) {
        await creditWallet({
          riderId: notes.riderId,
          type: 'RECHARGE',
          amountPaise: payment.amount,
          razorpayOrderId:   payment.order_id,
          razorpayPaymentId: payment.id,
          description: 'Wallet recharge via Razorpay (webhook)',
        });
      }

      if (notes.purpose === 'ORDER_PAYMENT' && notes.orderId) {
        // Atomic — app ka pay/verify aur webhook ek saath aayein to dispatch sirf ek baar.
        // Cancelled order ka payment aaye to bhi riders ko ring nahi (sirf pending).
        const current = await Order.findById(notes.orderId).select('status').lean();
        const order = current && await Order.findOneAndUpdate(
          { _id: notes.orderId, paymentStatus: { $ne: 'paid' } },
          {
            $set:  { paymentStatus: 'paid', razorpayPaymentId: payment.id },
            $push: { timeline: { status: current.status, note: 'Payment received (webhook)' } },
          },
          { returnDocument: 'after' }
        );
        if (order && order.status === 'pending') {
          dispatchOrder(req.io, req.onlineRiders, {
            orderId: order._id,
            pickup:  order.pickup.coordinates,
            payload: buildOrderPayload(order),
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    res.status(500).json({ received: false, message: err.message });
  }
};

module.exports = { razorpayWebhook };
