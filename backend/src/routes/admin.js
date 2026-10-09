const crypto = require('crypto');
const router = require('express').Router();
const ctrl   = require('../controllers/adminController');

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
router.get('/users',  adminKey, ctrl.getAllUsers);
router.get('/live',   adminKey, ctrl.getLive);

router.patch('/users/:id/block',   adminKey, ctrl.blockUser);
router.patch('/users/:id/unblock', adminKey, ctrl.unblockUser);

module.exports = router;
