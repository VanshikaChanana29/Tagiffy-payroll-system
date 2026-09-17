const mongoose = require('mongoose');

/**
 * A company holiday.
 *
 * Holidays are not working days: attendance shows them as Holiday rather than
 * Absent, leave spanning them is not charged, and payroll never docks pay for
 * them. One source of truth, used by all three.
 */
const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true,
    },
    date: {
      type: String, // YYYY-MM-DD, matching how attendance stores dates
      required: [true, 'Holiday date is required'],
      unique: true,
    },
    type: {
      type: String,
      // Restricted holidays are optional ones an employee may choose to take;
      // they are listed but do not automatically close the office.
      enum: ['Public', 'Restricted', 'Company'],
      default: 'Public',
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    // Department names (matching User.department) this holiday applies to.
    // Empty means organisation-wide — every department observes it.
    departments: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model('Holiday', holidaySchema);
