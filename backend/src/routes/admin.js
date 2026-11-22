const crypto = require('crypto');
const router = require('express').Router();
const ctrl   = require('../controllers/adminController');
const support = require('../controllers/supportController');
const wallets = require('../controllers/adminWalletController');
const commission = require('../controllers/adminCommissionController');

// Admin routes — API key header check. Key set na ho to sab band (pehle undefined === undefined
// se bina header ke access mil sakta tha). Timing-safe compare taaki key guess na ho sake.
const adminKey = (req, res, next) => {
  const expected = process.env.ADMIN_API_KEY || '';
  const given    = String(req.headers['x-admin-key'] || '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!expected || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.get('/stats',  adminKey, ctrl.getStats);
router.get('/orders', adminKey, ctrl.getAllOrders);
// Atka hua (picked_up) order admin complete kare — rider wala hi settlement chalta hai
router.post('/orders/:id/mark-delivered', adminKey, ctrl.markDelivered);
router.get('/users',  adminKey, ctrl.getAllUsers);
router.get('/live',   adminKey, ctrl.getLive);
router.get('/activity', adminKey, ctrl.getActivity);
// Commission & charges — har delivered order ka fare breakdown + platform/rider split
router.get('/commission', adminKey, commission.getCommission);
// Pricing — rate card + distance slabs + commission %, admin panel se badalte hain
router.get('/pricing',          adminKey, commission.getPricingAdmin);
router.put('/pricing',          adminKey, commission.updatePricing);
router.post('/pricing/preview', adminKey, commission.previewPricing);

router.patch('/users/:id/block',   adminKey, ctrl.blockUser);
router.patch('/users/:id/unblock', adminKey, ctrl.unblockUser);

// Rider wallets — balance dekho aur admin panel se paise add karo (ek / chune hue / sab riders)
router.get('/wallets',            adminKey, wallets.getWallets);
router.get('/riders/:id/wallet',  adminKey, wallets.getRiderWallet);
router.post('/wallets/credit',    adminKey, wallets.creditWallets);

// Support tickets — app se aaye sawaal, admin yahin se jawab/status deta hai
router.get('/support/tickets',              adminKey, support.adminListTickets);
router.get('/support/tickets/:id',          adminKey, support.adminGetTicket);
router.post('/support/tickets/:id/reply',   adminKey, support.adminReply);
router.patch('/support/tickets/:id/status', adminKey, support.adminSetStatus);

module.exports = router;
