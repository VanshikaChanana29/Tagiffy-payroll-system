const express = require('express');
const router = express.Router();
const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} = require('../controllers/holidayController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Everyone can read the calendar; only HR can change it.
router.route('/')
  .get(getHolidays)
  .post(authorize('admin'), createHoliday);

router.route('/:id')
  .put(authorize('admin'), updateHoliday)
  .delete(authorize('admin'), deleteHoliday);

module.exports = router;
