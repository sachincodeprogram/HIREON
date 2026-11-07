const crypto   = require('crypto');
const User     = require('../models/User');
const Referral = require('../models/Referral');
const { getOrCreateWallet, creditWallet } = require('./wallet');
const { sendWalletCreditPush } = require('./push');

// Refer & Earn — rider apne dost ko invite kare (code ya invite link se). Dost signup
// kare to referral 'joined' hota hai; dost ka PEHLA successful order delivered hone par
// (dost rider hai to uski pehli delivery, customer hai to uski pehli booking complete)
// rider ke wallet me bonus. Cancelled/unpaid order kabhi qualify nahi karta.
//
// Fraud se bachaav:
// - ek verified phone/email par zindagi me ek hi reward (Referral.refereeIdentity unique)
// - ek referral par ek hi reward — 'joined' → 'pending' atomic claim + idempotent wallet
//   credit (requestId = referral_<refereeId>), retry/double-call se double nahi
// - referrer khud dost ka order deliver kare (ya dost-rider referrer ka order) to woh
//   order qualify nahi karta — fake customer bana kar khud deliver karne wala jugaad band
// - ek rider ko pichhle 30 din me max REFERRAL_MONTHLY_LIMIT rewards
// - blocked/deleted rider ko reward nahi

const DUPLICATE_KEY_ERROR = 11000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 0/O aur 1/I/L jaise confuse karne wale akshar nahi — phone par bolkar bhi code de sakein
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{6,12}$/;

const isReferralEnabled = () => process.env.REFERRAL_ENABLED !== 'false';

// Reward paise me — default ₹100. .env se badlo.
const referralRewardPaise = () => {
  const v = Number(process.env.REFERRAL_REWARD_PAISE);
  return Number.isInteger(v) && v >= 100 ? v : 10000;
};

// Pichhle 30 din me ek rider ko max kitne rewards. 0 = koi limit nahi.
const referralMonthlyLimit = () => {
  const v = Number(process.env.REFERRAL_MONTHLY_LIMIT);
  return Number.isInteger(v) && v >= 0 ? v : 25;
};

// Invite link — Play Store ka link, `referrer` param me code. Play Store install ke
// baad yeh string app ko Install Referrer API se milti hai aur code apne aap lag jaata hai.
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.hireon';
const buildShareLink = (code) => {
  const url = new URL(process.env.REFERRAL_STORE_URL || PLAY_STORE_URL);
  url.searchParams.set('referrer', `utm_source=hireon_referral&utm_medium=invite&ref=${code}`);
  return url.toString();
};

const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isValidCodeFormat = (code) => CODE_RE.test(code);

// "Sachin Kumar" → "SACH" + 4 random = "SACH7K2Q". Hindi naam (latin akshar nahi) → "HR" + random.
const generateCode = (name) => {
  const prefix = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'HR';
  const bytes  = crypto.randomBytes(8 - prefix.length);
  let suffix = '';
  for (const b of bytes) suffix += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return prefix + suffix;
};

// Rider ka code — pehli baar maangne par banta hai. Unique index collision (bahut
// kam) par naya code try karo. Do requests ek saath aayein to jo pehle likhe wahi code.
const getOrCreateReferralCode = async (user) => {
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await User.updateOne(
        { _id: user._id, referralCode: { $exists: false } },
        { $set: { referralCode: generateCode(user.name) } }
      );
      const fresh = await User.findById(user._id).select('referralCode').lean();
      if (fresh?.referralCode) return fresh.referralCode;
    } catch (err) {
      if (err.code !== DUPLICATE_KEY_ERROR) throw err;
    }
  }
  throw new Error('Could not generate referral code');
};

const findReferrerByCode = (code) =>
  User.findOne({ referralCode: code, role: 'rider', deletedAt: null })
    .select('name phone isBlocked fcmToken');

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your friend';
const last10 = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

// Ek insaan ki pehchaan — verified phone, warna Google email, warna Firebase uid
const identityOf = ({ phone, email, uid }) => {
  const p = last10(phone);
  if (p.length === 10) return `phone:${p}`;
  if (email) return `email:${String(email).toLowerCase()}`;
  return `uid:${uid}`;
};

// Reward credit karo — fail ho to referral 'pending' rehta hai aur rider ke
// Refer screen kholne par dobara try hota hai (retryPendingRewards).
const rewardReferral = async (referral, referrer) => {
  try {
    const amountPaise = referral.rewardPaise || referralRewardPaise();
    const name = firstName(referral.refereeName);
    await getOrCreateWallet(referrer._id);
    const { wallet, transaction, duplicate } = await creditWallet({
      riderId:     referrer._id,
      type:        'RECHARGE', // purane app versions naya type nahi pehchante — source se pehchano
      amountPaise,
      description: `Referral bonus: ${name} joined HIREON`,
      source:        'referral',
      adminCategory: 'referral',
      requestId:     `referral_${referral.referee}`,
    });

    await Referral.updateOne(
      { _id: referral._id },
      { $set: { status: 'rewarded', transaction: transaction?._id || null, rewardedAt: new Date(), rewardPaise: amountPaise } }
    );
    referral.status = 'rewarded';

    if (!duplicate) {
      console.log(`[referral] REWARD referrer=${referrer._id} referee=${referral.referee} amount=${amountPaise}`);
      sendWalletCreditPush(referrer.fcmToken, { amountPaise, balancePaise: wallet.balance, label: `Referral bonus · ${name} joined HIREON` })
        .then((s) => { if (s === 'invalid-token') User.updateOne({ _id: referrer._id }, { $set: { fcmToken: null } }).catch(() => {}); })
        .catch(() => {});
    }
  } catch (err) {
    console.error(`[referral] reward failed referral=${referral._id}:`, err.message);
  }
};

// Signup ke turant baad (authController.register). Kabhi throw nahi karta — referral
// me gadbad se signup kabhi fail nahi hona chahiye.
// Return: { applied, reason? } — applied=true matlab code sahi tha aur dost link ho gaya
// (status 'joined'). Paise yahan nahi — dost ke pehle delivered order par (qualifyReferralForOrder).
const applyReferralOnSignup = async ({ user, code, channel, identity }) => {
  try {
    if (!isReferralEnabled()) return { applied: false, reason: 'disabled' };
    const normalized = normalizeCode(code);
    if (!normalized) return { applied: false, reason: 'no_code' };
    if (!isValidCodeFormat(normalized)) return { applied: false, reason: 'invalid' };

    const referrer = await findReferrerByCode(normalized);
    // Blocked rider ka code validate endpoint par bhi invalid hai — yahan bhi wahi
    if (!referrer || referrer.isBlocked || referrer._id.equals(user._id)) return { applied: false, reason: 'invalid' };
    if (identity === identityOf({ phone: referrer.phone })) return { applied: false, reason: 'self' };

    try {
      await Referral.create({
        referrer:        referrer._id,
        referee:         user._id,
        code:            normalized,
        channel:         channel === 'link' ? 'link' : 'code',
        refereeIdentity: identity,
        refereeName:     user.name,
        refereeRole:     user.role,
        status:          'joined',
      });
    } catch (err) {
      // Is phone/email se pehle bhi kisi ne referral le liya (account delete karke dobara signup)
      if (err.code === DUPLICATE_KEY_ERROR) return { applied: false, reason: 'already_used' };
      throw err;
    }

    await User.updateOne({ _id: user._id }, { $set: { referredBy: referrer._id } });
    user.referredBy = referrer._id;
    return { applied: true };
  } catch (err) {
    console.error('[referral] apply failed:', err.message);
    return { applied: false, reason: 'error' };
  }
};

// Order delivered hone ke baad (orderController.confirmDelivery). Order ke customer aur
// rider dono me se jo bhi 'joined' referral wala dost hai, uska referral qualify karo.
// Kabhi throw nahi karta — delivery confirm kabhi referral ki wajah se fail na ho.
const qualifyReferralForOrder = async (order) => {
  try {
    if (!order || order.status !== 'delivered') return;
    // COD: cash delivery par mila (confirmDelivery 'paid' set karta hai). ONLINE: Razorpay se paid hona zaroori.
    if (order.paymentStatus !== 'paid') return;

    const parties = [
      { referee: order.customer, counterpart: order.rider },    // dost customer → pehli booking complete
      { referee: order.rider,    counterpart: order.customer }, // dost rider → pehli delivery
    ];

    for (const { referee, counterpart } of parties) {
      if (!referee) continue;
      const referral = await Referral.findOne({ referee, status: 'joined' });
      if (!referral) continue;

      // Referrer khud hi is order ka doosra paksh hai — qualify nahi, agle genuine order ka intezaar
      if (counterpart && String(counterpart) === String(referral.referrer)) {
        console.log(`[referral] skip self-dealing order=${order._id} referral=${referral._id}`);
        continue;
      }

      const referrer = await User.findById(referral.referrer).select('name isBlocked deletedAt fcmToken');
      let status = 'pending';
      let rejectReason = '';
      if (!referrer || referrer.deletedAt) {
        status = 'rejected'; rejectReason = 'referrer_deleted';
      } else if (referrer.isBlocked) {
        status = 'rejected'; rejectReason = 'referrer_blocked';
      } else {
        const limit = referralMonthlyLimit();
        if (limit > 0) {
          const recent = await Referral.countDocuments({
            referrer: referrer._id, status: 'rewarded', rewardedAt: { $gte: new Date(Date.now() - 30 * DAY_MS) },
          });
          if (recent >= limit) { status = 'rejected'; rejectReason = 'monthly_limit'; }
        }
      }

      // Atomic claim — do delivery calls ek saath aayein to bhi sirf ek hi 'joined' ko badal paayega
      const claimed = await Referral.findOneAndUpdate(
        { _id: referral._id, status: 'joined' },
        { $set: {
          status, rejectReason,
          rewardPaise:     status === 'pending' ? referralRewardPaise() : 0,
          qualifyingOrder: order._id,
          qualifiedAt:     new Date(),
        } },
        { returnDocument: 'after' }
      );
      if (!claimed) continue;

      console.log(`[referral] QUALIFIED referral=${claimed._id} order=${order._id} status=${status}${rejectReason ? ` reason=${rejectReason}` : ''}`);
      if (status === 'pending') await rewardReferral(claimed, referrer);
    }
  } catch (err) {
    console.error(`[referral] qualify failed order=${order?._id}:`, err.message);
  }
};

// Jo reward pehle credit nahi ho paaye (DB/network glitch) unhe dobara try karo.
// creditWallet idempotent hai, isliye yeh delivery ke saath race kare to bhi double nahi.
const retryPendingRewards = async (referrer) => {
  if (referrer.isBlocked) return;
  const pending = await Referral.find({ referrer: referrer._id, status: 'pending' }).limit(20);
  for (const r of pending) await rewardReferral(r, referrer);
};

module.exports = {
  isReferralEnabled,
  referralRewardPaise,
  referralMonthlyLimit,
  buildShareLink,
  normalizeCode,
  isValidCodeFormat,
  getOrCreateReferralCode,
  findReferrerByCode,
  firstName,
  identityOf,
  applyReferralOnSignup,
  qualifyReferralForOrder,
  retryPendingRewards,
};
