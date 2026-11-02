const express = require('express');
const router = express.Router();
const { runPayroll } = require('../controllers/payrollRunController');
const {
  getIncentives,
  downloadIncentiveTemplate,
  uploadIncentives,
  deleteIncentive,
} = require('../controllers/incentiveController');
const { protect, authorize } = require('../middleware/auth');
const { uploadEmployeeSheet } = require('../middleware/upload');

router.use(protect);

// Preview with dryRun: true, commit with dryRun: false.
router.post('/run', authorize('admin'), runPayroll);

// Incentives uploaded from a sheet, added to that month's payslips.
router.get('/incentives', authorize('admin'), getIncentives);
router.get('/incentives/template', authorize('admin'), downloadIncentiveTemplate);
router.post('/incentives/upload', authorize('admin'), uploadEmployeeSheet, uploadIncentives);
router.delete('/incentives/:id', authorize('admin'), deleteIncentive);

module.exports = router;
