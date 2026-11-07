const router = require('express').Router();
const ctrl   = require('../controllers/referralController');
const { protect, verifyToken, requireRole } = require('../middleware/auth');

router.get('/me',        protect, requireRole('rider'), ctrl.getMyReferrals);
router.post('/validate', verifyToken, ctrl.validateCode);

module.exports = router;
