const express = require('express');
const router = express.Router();
const {
  getSalaryAdvances,
  createSalaryAdvance,
  cancelSalaryAdvance,
} = require('../controllers/salaryAdvanceController');
const { protect, authorize } = require('../middleware/auth');

// Advances are HR-only: admin and super_admin (authorize lets super_admin through).
router.use(protect, authorize('admin'));

router.get('/', getSalaryAdvances);
router.post('/', createSalaryAdvance);
router.put('/:id/cancel', cancelSalaryAdvance);

module.exports = router;
