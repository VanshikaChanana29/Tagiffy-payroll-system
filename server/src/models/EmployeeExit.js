const mongoose = require('mongoose');

/**
 * One employee leaving the organisation: resignation, termination, etc.
 *
 * This is the exit register. Records are kept even if the person is later
 * reactivated (e.g. rehired), so HR always has the history of who left when.
 * The employee's details are snapshotted so the record still reads correctly
 * after their profile changes.
 *
 * Lifecycle (status is derived, see exitStatus below):
 *   - Serving Notice: last working day is today or later; account still active.
 *   - Exited: last working day has passed; account was deactivated.
 *   - Withdrawn: resignation taken back before the last working day.
 */
const EXIT_TYPES = ['Resigned', 'Terminated', 'Absconded', 'Other'];

const employeeExitSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    snapshot: {
      name: { type: String, default: '' },
      employeeId: { type: String, default: '' },
      email: { type: String, default: '' },
      department: { type: String, default: '' },
      designation: { type: String, default: '' },
      joiningDate: { type: Date, default: null },
    },
    exitType: {
      type: String,
      enum: EXIT_TYPES,
      required: true,
    },
    // Resignation submitted on / terminated on.
    noticeDate: {
      type: Date,
      required: true,
    },
    lastWorkingDay: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Set once the account is switched to Inactive for this exit, so a later
    // manual reactivation (rehire) is never undone by the scheduler.
    deactivatedAt: {
      type: Date,
      default: null,
    },
    // Relieved before the agreed last working day (replacement found, role no
    // longer needed...). originalLastWorkingDay keeps the date first agreed.
    originalLastWorkingDay: {
      type: Date,
      default: null,
    },
    earlyReliefReason: {
      type: String,
      default: '',
      trim: true,
    },
    relievedEarlyAt: {
      type: Date,
      default: null,
    },
    relievedEarlyBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    withdrawnBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

employeeExitSchema.index({ employee: 1, createdAt: -1 });
employeeExitSchema.index({ lastWorkingDay: -1 });

/** Start of today in server-local time (pinned to IST in server.js). */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const exitStatus = (exit) => {
  if (exit.withdrawnAt) return 'Withdrawn';
  return exit.lastWorkingDay < startOfToday() ? 'Exited' : 'Serving Notice';
};

const EmployeeExit = mongoose.model('EmployeeExit', employeeExitSchema);

module.exports = EmployeeExit;
module.exports.EXIT_TYPES = EXIT_TYPES;
module.exports.exitStatus = exitStatus;
module.exports.startOfToday = startOfToday;
