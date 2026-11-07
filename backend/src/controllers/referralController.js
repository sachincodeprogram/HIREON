const Referral = require('../models/Referral');
const {
  isReferralEnabled, referralRewardPaise, referralMonthlyLimit, buildShareLink,
  normalizeCode, isValidCodeFormat, getOrCreateReferralCode, findReferrerByCode,
  firstName, retryPendingRewards,
} = require('../utils/referral');
const { success, error } = require('../utils/apiResponse');

// GET /api/v1/referrals/me — rider ka Refer & Earn: code, invite link, kamai aur dost
const getMyReferrals = async (req, res) => {
  try {
    const rider = req.user;
    const code  = await getOrCreateReferralCode(rider);
    await retryPendingRewards(rider);

    const [referrals, totals] = await Promise.all([
      Referral.find({ referrer: rider._id })
        .select('refereeName refereeRole channel status rejectReason rewardPaise createdAt rewardedAt')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Referral.aggregate([
        { $match: { referrer: rider._id } },
        { $group: {
          _id: null,
          joined:   { $sum: 1 },
          rewarded: { $sum: { $cond: [{ $eq: ['$status', 'rewarded'] }, 1, 0] } },
          earned:   { $sum: { $cond: [{ $eq: ['$status', 'rewarded'] }, '$rewardPaise', 0] } },
        } },
      ]),
    ]);

    res.json(success('Referrals fetched', {
      enabled:      isReferralEnabled(),
      code,
      shareLink:    buildShareLink(code),
      rewardPaise:  referralRewardPaise(),
      monthlyLimit: referralMonthlyLimit(),
      stats: {
        joined:      totals[0]?.joined   || 0,
        rewarded:    totals[0]?.rewarded || 0,
        earnedPaise: totals[0]?.earned   || 0,
      },
      // Dost ka sirf pehla naam — poora naam/phone rider ko nahi dikhate
      referrals: referrals.map(r => ({
        _id:          r._id,
        name:         firstName(r.refereeName),
        role:         r.refereeRole,
        channel:      r.channel,
        status:       r.status,
        rejectReason: r.rejectReason,
        rewardPaise:  r.rewardPaise,
        createdAt:    r.createdAt,
      })),
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// POST /api/v1/referrals/validate  { code }
// Signup ke time (profile abhi nahi bani) — sirf Firebase token chahiye. Galat code par
// user ko wahin bata do, register ke baad chupchap ignore hone se behtar.
const validateCode = async (req, res) => {
  try {
    if (!isReferralEnabled()) return res.json(success('Referral program paused', { valid: false, reason: 'disabled' }));

    const code = normalizeCode(req.body?.code);
    if (!isValidCodeFormat(code)) return res.json(success('Invalid code', { valid: false, reason: 'invalid' }));

    const referrer = await findReferrerByCode(code);
    if (!referrer || referrer.isBlocked) return res.json(success('Invalid code', { valid: false, reason: 'invalid' }));

    res.json(success('Valid code', { valid: true, code, referrerName: firstName(referrer.name) }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { getMyReferrals, validateCode };
