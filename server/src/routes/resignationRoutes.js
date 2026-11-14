const express = require('express');
const router = express.Router();
const {
  submitResignation,
  getMyResignations,
  withdrawResignation,
  getResignations,
  acceptResignation,
  rejectResignation,
} = require('../controllers/resignationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Any employee: submit, view and withdraw their own.
router.post('/', submitResignation);
router.get('/mine', getMyResignations);
router.post('/:id/withdraw', withdrawResignation);

// HR sees everyone; a manager sees and decides for their direct reports.
router.get('/', authorize('admin', 'manager'), getResignations);
router.post('/:id/accept', authorize('admin', 'manager'), acceptResignation);
router.post('/:id/reject', authorize('admin', 'manager'), rejectResignation);

module.exports = router;
