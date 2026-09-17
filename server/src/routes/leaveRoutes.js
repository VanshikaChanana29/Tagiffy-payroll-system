const express = require('express');
const router = express.Router();
const {
  applyLeave,
  cancelMyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
} = require('../controllers/leaveController');
const { protect, authorize } = require('../middleware/auth');

// All leave endpoints require JWT authentication
router.use(protect);

// Employee actions
router.post('/', applyLeave);
router.get('/my-leaves', getMyLeaves);
router.put('/:id/cancel', cancelMyLeave);

// Admin and manager actions. Managers are scoped to their own team inside the
// controller, so the same endpoints serve both roles.
router.get('/all', authorize('admin', 'manager'), getAllLeaves);
router.put('/:id/status', authorize('admin', 'manager'), updateLeaveStatus);

module.exports = router;
