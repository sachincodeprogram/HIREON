const Order = require('../models/Order');
const User  = require('../models/User');
const { creditWallet, debitWallet } = require('./wallet');
const { splitFareForCommission } = require('./commission');
const { qualifyReferralForOrder } = require('./referral');

// Order ko 'delivered' banane ka EK hi raasta — rider ka OTP+swipe confirm aur admin
// ka "Mark Delivered" dono yahi use karte hain, taaki status, rider stats, wallet
// settlement aur referral ka hisaab dono jagah bilkul same rahe.
//
// `found` = pehle se load kiya hua order (rider/OTP checks caller karta hai).
// `fromStatuses` = kin statuses se deliver karna allowed hai.
// Returns { order, changed } — changed=false matlab order pehle se delivered tha
// (duplicate request); null order matlab is stage par deliver nahi ho sakta.
const settleDelivery = async ({
  found,
  note = 'Parcel delivered successfully',
  fromStatuses = ['accepted', 'picked_up', 'in_transit'],
  io,
}) => {
  const riderId = found.rider;

  // Idempotent + atomic: order sirf EK baar 'delivered' banta hai. Do request ek saath
  // aayein (double-tap / network retry / admin + rider ek saath) to sirf ek hi yeh
  // update jeetegi — wahi rider stats badhati hai. Baaki ko pehle se delivered order milta hai.
  const delivered = await Order.findOneAndUpdate(
    { _id: found._id, status: { $in: fromStatuses } },
    {
      $set: {
        status:       'delivered',
        deliveredAt:  new Date(),
        'fare.final': found.fare.estimated,
        // COD: cash collected hand-to-hand
        ...(found.paymentMethod === 'COD' ? { paymentStatus: 'paid' } : {}),
      },
      $push: { timeline: { status: 'delivered', note } },
    },
    { returnDocument: 'after' }
  );

  let order = delivered;
  if (!delivered) {
    order = await Order.findById(found._id);
    if (order?.status !== 'delivered') return { order: null, changed: false };
  } else {
    // Update rider stats — sirf us request me jisne order deliver kiya
    await User.findByIdAndUpdate(riderId, {
      $inc: { totalEarnings: order.riderEarning, totalDeliveries: 1 },
    });
  }

  // Wallet settlement — atomic + idempotent (order+type unique index), isliye
  // ek retried confirm-delivery call se double credit/debit kabhi nahi hota.
  // Duplicate request par bhi jaan-boojh kar chalta hai: pehli request deliver
  // karke settlement se pehle crash ho jaaye to retry baaki kaam poora kar de.
  // ONLINE: fare pehle hi Razorpay se platform ko mil chuka — rider ko
  // (fare - commission) wallet me credit karo. COD: cash pura rider ke paas
  // hai — sirf commission wallet se debit karo (balance negative ja sakta hai).
  try {
    const farePaise = Math.round(order.fare.final * 100);
    const { commissionPaise, riderNetPaise } = splitFareForCommission(farePaise);
    if (order.paymentMethod === 'ONLINE') {
      await creditWallet({
        riderId,
        type: 'EARNING',
        amountPaise: riderNetPaise,
        orderId: order._id,
        description: `Earning for order ${order.orderId}`,
      });
    } else {
      await debitWallet({
        riderId,
        type: 'COMMISSION_DEBIT',
        amountPaise: commissionPaise,
        orderId: order._id,
        description: `Commission for COD order ${order.orderId}`,
      });
    }
  } catch (walletErr) {
    // Delivery ho chuki — wallet settlement fail hone par bhi response block
    // mat karo, log karke aage badho (ops reconcile kar sakta hai).
    console.error(`Wallet settlement failed for order ${order._id}:`, walletErr.message);
  }

  // Refer & Earn — customer ya rider ka pehla successful order ho to unke referrer ko
  // bonus. Kabhi throw nahi karta, delivery response par asar nahi.
  await qualifyReferralForOrder(order);

  // Rider + customer dono order room me hain — dono ki screen live update ho jaati hai.
  io?.to(order._id.toString()).emit('order_update', { status: 'delivered' });

  return { order, changed: !!delivered };
};

module.exports = { settleDelivery };
