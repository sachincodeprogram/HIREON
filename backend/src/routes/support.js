const router = require('express').Router();
const ctrl   = require('../controllers/supportController');
const { protect } = require('../middleware/auth');

// Customer + rider dono ke liye — har user sirf apne tickets dekh/likh sakta hai.
router.post('/tickets',              protect, ctrl.createTicket);
router.get('/tickets',               protect, ctrl.listMyTickets);
router.get('/tickets/:id',           protect, ctrl.getMyTicket);
router.post('/tickets/:id/messages', protect, ctrl.addMyMessage);

module.exports = router;
