const express = require('express');
const router = express.Router();
const {
  checkIn,
  checkOut,
  getTodayStatus,
  getMyAttendanceHistory,
  getMyWeeklyView,
  getMyMonthlyView,
  getAllAttendance,
  updateAttendanceRecord,
  createRegularizationRequest,
  getMyRegularizationRequests,
  getAllRegularizationRequests,
  reviewRegularizationRequest,
  recalculateAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');

// All attendance routes require JWT authentication
router.use(protect);

// Employee actions & personal logs
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/today', getTodayStatus);
router.get('/my-history', getMyAttendanceHistory);
router.get('/my-weekly', getMyWeeklyView);
router.get('/my-monthly', getMyMonthlyView);
router.get('/weekly-view', getMyWeeklyView);

// Attendance correction (regularization) requests.
// Declared before '/:id' so "requests" is never read as a record id.
router.post('/requests', createRegularizationRequest);
router.get('/requests/my', getMyRegularizationRequests);
router.get('/requests', authorize('admin', 'manager'), getAllRegularizationRequests);
router.put('/requests/:id', authorize('admin', 'manager'), reviewRegularizationRequest);

// Admin oversight & management
router.post('/recalculate', authorize('admin'), recalculateAttendance);
router.get('/all', authorize('admin', 'manager'), getAllAttendance);
router.put('/:id', authorize('admin', 'manager'), updateAttendanceRecord);

module.exports = router;
