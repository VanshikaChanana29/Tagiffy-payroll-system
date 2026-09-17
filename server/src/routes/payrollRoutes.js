const express = require('express');
const router = express.Router();
const { runPayroll } = require('../controllers/payrollRunController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Preview with dryRun: true, commit with dryRun: false.
router.post('/run', authorize('admin'), runPayroll);

module.exports = router;
