const mongoose = require('mongoose');

/**
 * A resignation an employee submits from the portal (instead of by email).
 *
 *   Pending   → waiting for HR or the reporting manager.
 *   Accepted  → the approver set the last working day; an EmployeeExit was
 *               created, and from here the exit register drives everything.
 *   Rejected  → the approver declined it (e.g. after a retention talk).
 *   Withdrawn → the employee took it back while it was still pending.
 */
const RESIGNATION_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Withdrawn'];

const resignationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    resignationDate: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: RESIGNATION_STATUSES,
      default: 'Pending',
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    // Set on acceptance.
    lastWorkingDay: {
      type: Date,
      default: null,
    },
    exit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeExit',
      default: null,
    },
  },
  { timestamps: true }
);

resignationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Resignation', resignationSchema);
module.exports.RESIGNATION_STATUSES = RESIGNATION_STATUSES;
