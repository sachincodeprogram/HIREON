const mongoose          = require('mongoose');
const User              = require('../models/User');
const Wallet            = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { getOrCreateWallet, creditWallet } = require('../utils/wallet');
const { walletMinBalancePaise } = require('../utils/commission');
const { sendWalletCreditPush } = require('../utils/push');
const { success, error } = require('../utils/apiResponse');

// Admin panel se rider wallet me manual credit (incentive, bonus, refund...).
// Har credit wahi atomic ledger entry banata hai jo order/recharge banate hain
// (utils/wallet.js) — balance aur audit trail kabhi alag nahi hote.

// type purane app versions ke liye bhi known hona chahiye (WalletScreen unknown type
// par crash karta) — isliye naya type nahi, category ko RECHARGE/REFUND par map karo.
const CATEGORIES = {
  incentive:    { label: 'Incentive',          type: 'RECHARGE' },
  bonus:        { label: 'Bonus',              type: 'RECHARGE' },
  promo:        { label: 'Promotional credit', type: 'RECHARGE' },
  refund:       { label: 'Refund',             type: 'REFUND' },
  compensation: { label: 'Compensation',       type: 'REFUND' },
  adjustment:   { label: 'Balance adjustment', type: 'REFUND' },
  other:        { label: 'Credit',             type: 'RECHARGE' },
};

const MIN_CREDIT_PAISE   = 100; // ₹1
const MAX_RIDERS_PER_RUN = 1000;
const CONCURRENCY        = 5;

// Ek rider ko ek baar me max kitna — galti se ₹1,00,000 na chala jaaye. .env se badlo.
const maxCreditPaise = () => {
  const v = Number(process.env.ADMIN_WALLET_MAX_CREDIT_PAISE);
  return Number.isInteger(v) && v >= MIN_CREDIT_PAISE ? v : 1000000; // ₹10,000
};

// GET /api/v1/admin/wallets — sab riders ka current balance (Users table ke liye)
const getWallets = async (req, res) => {
  try {
    const wallets = await Wallet.find({}).select('rider balance updatedAt').lean();
    res.json(success('Wallets fetched', {
      minBalance: walletMinBalancePaise(),
      maxCredit:  maxCreditPaise(),
      wallets: wallets.map(w => ({ rider: w.rider, balance: w.balance, updatedAt: w.updatedAt })),
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// GET /api/v1/admin/riders/:id/wallet — ek rider ka balance + recent ledger
const getRiderWallet = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json(error('Invalid rider id'));
    const rider = await User.findById(req.params.id).select('role').lean();
    if (!rider || rider.role !== 'rider') return res.status(404).json(error('Rider not found'));

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const [wallet, transactions] = await Promise.all([
      Wallet.findOne({ rider: rider._id }).lean(),
      WalletTransaction.find({ rider: rider._id })
        .select('-wallet -requestId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('order', 'orderId')
        .lean(),
    ]);
    res.json(success('Rider wallet', {
      balance:    wallet?.balance ?? 0,
      minBalance: walletMinBalancePaise(),
      maxCredit:  maxCreditPaise(),
      transactions,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

// Chhote batches me parallel — 1000 riders ek-ek karke bahut der lagate, sab ek saath DB ko dabate
const inBatches = async (items, size, fn) => {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
};

// POST /api/v1/admin/wallets/credit
// Body: { riderIds?: string[], all?: boolean, amountPaise, category, note, requestId }
// all=true → har active rider (blocked/deleted chhod ke). riderIds → sirf wahi (deleted skip).
const creditWallets = async (req, res) => {
  try {
    const { riderIds, all } = req.body || {};
    const amountPaise = Number(req.body?.amountPaise);
    const category    = String(req.body?.category || '');
    const note        = String(req.body?.note || '').trim();
    const requestId   = String(req.body?.requestId || '');
    const max         = maxCreditPaise();

    if (!Number.isInteger(amountPaise) || amountPaise < MIN_CREDIT_PAISE) {
      return res.status(400).json(error('Amount must be at least ₹1'));
    }
    if (amountPaise > max) {
      return res.status(400).json(error(`Amount cannot exceed ₹${(max / 100).toLocaleString('en-IN')} per rider`));
    }
    if (!CATEGORIES[category]) return res.status(400).json(error('Please choose a valid reason'));
    if (note.length < 3)   return res.status(400).json(error('Please add a note (min 3 characters)'));
    if (note.length > 200) return res.status(400).json(error('Note is too long (max 200 characters)'));
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return res.status(400).json(error('Invalid requestId'));

    let riders;
    const skipped = [];
    if (all === true) {
      riders = await User.find({ role: 'rider', deletedAt: null, isBlocked: { $ne: true } })
        .select('name fcmToken').limit(MAX_RIDERS_PER_RUN + 1).lean();
    } else {
      if (!Array.isArray(riderIds) || riderIds.length === 0) return res.status(400).json(error('Select at least one rider'));
      const ids = [...new Set(riderIds.map(String))];
      if (ids.some(id => !mongoose.isValidObjectId(id))) return res.status(400).json(error('Invalid rider id in selection'));
      if (ids.length > MAX_RIDERS_PER_RUN) return res.status(400).json(error(`Max ${MAX_RIDERS_PER_RUN} riders at a time`));

      const found = await User.find({ _id: { $in: ids } }).select('name role deletedAt fcmToken').lean();
      const byId  = new Map(found.map(u => [u._id.toString(), u]));
      riders = [];
      for (const id of ids) {
        const u = byId.get(id);
        if (!u || u.role !== 'rider') skipped.push({ _id: id, name: u?.name || '', reason: 'Not a rider' });
        else if (u.deletedAt)        skipped.push({ _id: id, name: u.name, reason: 'Account deleted' });
        else riders.push(u);
      }
    }
    if (riders.length > MAX_RIDERS_PER_RUN) return res.status(400).json(error(`Max ${MAX_RIDERS_PER_RUN} riders at a time`));
    if (riders.length === 0) return res.status(400).json(error('No eligible riders to credit'));

    const cat         = CATEGORIES[category];
    const description = `HIREON ${cat.label}: ${note}`;
    const credited = [];
    const failed   = [];

    await inBatches(riders, CONCURRENCY, async (r) => {
      try {
        // Pehle wallet bana lo — naye rider ka wallet transaction ke andar banne par
        // parallel requests me write-conflict aa sakta hai.
        await getOrCreateWallet(r._id);
        const { wallet, duplicate } = await creditWallet({
          riderId: r._id,
          type: cat.type,
          amountPaise,
          description,
          source: 'admin',
          adminCategory: category,
          requestId,
        });
        credited.push({ _id: r._id, name: r.name, balance: wallet.balance, duplicate });
        if (!duplicate) {
          sendWalletCreditPush(r.fcmToken, { amountPaise, balancePaise: wallet.balance, label: `${cat.label} · ${note}` })
            .then((s) => { if (s === 'invalid-token') User.updateOne({ _id: r._id }, { $set: { fcmToken: null } }).catch(() => {}); })
            .catch(() => {});
        }
      } catch (e) {
        failed.push({ _id: r._id, name: r.name, error: e.message });
      }
    });

    const fresh = credited.filter(c => !c.duplicate).length;
    console.log(`[admin] WALLET CREDIT req=${requestId} category=${category} amount=${amountPaise} credited=${fresh} dup=${credited.length - fresh} skipped=${skipped.length} failed=${failed.length}`);

    res.json(success(failed.length ? 'Credited with some failures' : 'Wallets credited', {
      requestId,
      amountPaise,
      category,
      credited,
      skipped,
      failed,
      totalPaise: fresh * amountPaise,
    }));
  } catch (err) {
    res.status(500).json(error(err.message));
  }
};

module.exports = { getWallets, getRiderWallet, creditWallets, CATEGORIES };
