const express = require('express');
const router = express.Router();
const {
  submitReimbursement,
  getMyReimbursements,
  getAllReimbursements,
  updateReimbursementStatus,
  cancelMyReimbursement,
  downloadReimbursementReceipt,
} = require('../controllers/reimbursementController');
const { protect, authorize } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');

// All reimbursement endpoints require JWT authentication
router.use(protect);

// Employee actions
router.post('/', uploadReceipt, submitReimbursement);
router.get('/my-reimbursements', getMyReimbursements);
router.get('/:id/receipt', downloadReimbursementReceipt);
router.put('/:id/cancel', cancelMyReimbursement);

// Admin and manager actions. Managers are scoped to their own team inside the
// controller, so the same endpoints serve both roles.
router.get('/all', authorize('admin', 'manager'), getAllReimbursements);
router.put('/:id/status', authorize('admin', 'manager'), updateReimbursementStatus);

module.exports = router;
