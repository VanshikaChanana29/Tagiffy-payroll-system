const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leaveType: {
      type: String,
      enum: ['Paid', 'Sick', 'Unpaid'],
      required: [true, 'Leave type is required'],
    },
    startDate: {
      type: String, // Format: YYYY-MM-DD
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: String, // Format: YYYY-MM-DD
      required: [true, 'End date is required'],
    },
    // Working days actually charged against the balance. Weekends and other
    // non-working days inside the range are not deducted.
    daysCount: {
      type: Number,
      required: true,
      min: [0.5, 'Days count must be at least 0.5'],
    },
    // Total calendar days the request spans, kept so the UI can show
    // "18-21 Sep (4 days, 2 working days charged)".
    calendarDays: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      required: [true, 'Reason for leave is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    adminComment: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Leave', leaveSchema);
