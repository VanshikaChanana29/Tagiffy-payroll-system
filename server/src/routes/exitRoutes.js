const express = require('express');
const router = express.Router();
const { getExits, createExit, updateExit, withdrawExit, relieveEarly } = require('../controllers/exitController');
const { protect, authorize } = require('../middleware/auth');

// The exit register is HR-only.
router.use(protect, authorize('admin'));

router.route('/').get(getExits).post(createExit);
router.put('/:id', updateExit);
router.post('/:id/withdraw', withdrawExit);
router.post('/:id/relieve-early', relieveEarly);

module.exports = router;
