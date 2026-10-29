const { messaging } = require('../config/firebase');

// Rider ko naya-order FCM push — screen lock / app background / app band hone
// par bhi order RING kare (sirf chup notification nahi). Isliye yeh DATA-ONLY
// message hai: notification payload hota to system tray khud dikha deta aur
// app ka background handler kabhi nahi chalta. Data-only + priority high se
// app ka setBackgroundMessageHandler (index.js) har haal me chalta hai aur
// notifee se call-jaisi full-screen looping-ring notification dikhata hai.
// Title/body bhi data me jaate hain (FCM data values sirf string hoti hain).
// Return: 'invalid-token' agar token expire/uninstall ho gaya (caller saaf kare).
const sendOrderPush = async (fcmToken, order) => {
  if (!fcmToken) return null;
  try {
    await messaging().send({
      token: fcmToken,
      data: {
        type: 'new_order_request',
        orderId: order._id ? order._id.toString() : String(order._id),
        title: `🔔 Naya Order! ₹${order.riderEarning || ''} kamai`,
        body: `📦 Pickup: ${order.pickup?.address || 'app me dekho'}\n📍 Drop: ${order.delivery?.address || 'app me dekho'}`,
      },
      android: {
        priority: 'high', // Doze me bhi turant deliver ho
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] send failed:', e.message);
    return null;
  }
};

// Rider ko address-change push — socket toota ho / app background me ho tab
// bhi naya delivery address pahunch jaye (order_update sirf room me jaata hai,
// jo reconnect par miss ho sakta hai).
const sendAddressChangePush = async (fcmToken, order) => {
  if (!fcmToken) return null;
  try {
    await messaging().send({
      token: fcmToken,
      notification: {
        title: '📍 Delivery Address Badla',
        body: `Naya address: ${order.delivery?.address || 'app me dekho'}`,
      },
      data: {
        type: 'address_changed',
        orderId: order._id ? order._id.toString() : String(order._id),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'orders',
          sound: 'default',
          defaultVibrateTimings: true,
          priority: 'max',
          visibility: 'public',
        },
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] address-change send failed:', e.message);
    return null;
  }
};

// Rider ko order-cancel push — rider pickup ke raaste me ho aur app band /
// background me ho (socket nahi) tab bhi turant pata chale. DATA-ONLY (naye
// order jaisa) taaki app ka background handler (index.js) rider ki chuni hui
// bhasha me notification dikhaye aur socket wale alert ke saath duplicate na
// bane (dono ek hi notification id use karte hain). Purane app versions is
// type ko ignore kar dete hain — koi side effect nahi.
const sendCancelPush = async (fcmToken, order) => {
  if (!fcmToken) return null;
  try {
    await messaging().send({
      token: fcmToken,
      data: {
        type: 'order_cancelled',
        orderId: order._id ? order._id.toString() : String(order._id),
        displayId: order.orderId ? String(order.orderId) : '',
        cancelledBy: order.cancelledBy || '',
      },
      android: {
        priority: 'high', // Doze me bhi turant deliver ho
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] cancel send failed:', e.message);
    return null;
  }
};

// Ring band karne wala push — order cancel ho gaya ya kisi aur rider ne le
// liya. Jin riders ka phone abhi naye order ki ring baja raha hai (app band /
// lock screen), unki ring turant ruk jaaye, 90s timeout ka intezaar na ho.
// DATA-ONLY + high priority: app ka background handler notification hata deta
// hai. Purane app versions is type ko ignore karte hain.
const sendRingWithdrawPush = async (fcmToken, orderId, reason) => {
  if (!fcmToken) return null;
  try {
    await messaging().send({
      token: fcmToken,
      data: {
        type: 'order_withdrawn',
        orderId: String(orderId),
        reason: reason || '',
      },
      android: {
        priority: 'high',
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] ring-withdraw send failed:', e.message);
    return null;
  }
};

// Support team ne ticket par jawab diya — user ko notification (app band ho
// tab bhi dikhe, isliye notification payload). Tap karne par app khulti hai.
const sendSupportReplyPush = async (fcmToken, ticket, text) => {
  if (!fcmToken) return null;
  try {
    const body = String(text || '').replace(/\s+/g, ' ').slice(0, 120);
    await messaging().send({
      token: fcmToken,
      notification: {
        title: `HIREON Support · ${ticket.ticketNo}`,
        body: body || 'You have a new reply from our support team',
      },
      data: {
        type: 'support_reply',
        ticketId: ticket._id.toString(),
        ticketNo: String(ticket.ticketNo),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'order_updates',
          sound: 'default',
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] support-reply send failed:', e.message);
    return null;
  }
};

// Admin ne rider ke wallet me paise daale — rider ko notification (app band ho
// tab bhi dikhe, isliye notification payload). Purane app versions bhi tray me dikhayenge.
const sendWalletCreditPush = async (fcmToken, { amountPaise, balancePaise, label }) => {
  if (!fcmToken) return null;
  try {
    const rs = (p) => (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    await messaging().send({
      token: fcmToken,
      notification: {
        title: `💰 ₹${rs(amountPaise)} added to your wallet`,
        body: `${label || 'Credit from HIREON'} · New balance ₹${rs(balancePaise)}`,
      },
      data: {
        type: 'wallet_credit',
        amountPaise: String(amountPaise),
        balancePaise: String(balancePaise),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'order_updates',
          sound: 'default',
          defaultVibrateTimings: true,
          visibility: 'public',
        },
      },
    });
    return 'sent';
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      return 'invalid-token';
    }
    console.warn('[PUSH] wallet-credit send failed:', e.message);
    return null;
  }
};

module.exports = { sendOrderPush, sendAddressChangePush, sendCancelPush, sendRingWithdrawPush, sendSupportReplyPush, sendWalletCreditPush };
