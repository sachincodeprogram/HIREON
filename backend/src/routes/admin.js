const router = require('express').Router();
const ctrl   = require('../controllers/adminController');
const { protect } = require('../middleware/auth');

// Admin routes — protect with a simple API key header check (replace with proper admin role later)
const adminKey = (req, res, next) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.get('/stats',  adminKey, ctrl.getStats);
router.get('/orders', adminKey, ctrl.getAllOrders);
router.get('/users',  adminKey, ctrl.getAllUsers);

module.exports = router;
