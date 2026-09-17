const mongoose = require('mongoose');

/**
 * An employee-raised correction for a day's attendance — a forgotten punch, a
 * wrong time, or a day marked absent by mistake.
 *
 * Employees cannot edit attendance directly; they request a change and HR
 * approves it, which keeps an auditable trail of who changed what and why.
 */
const attendanceRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    // What the employee says the punches should have been ("HH:mm").
    requestedCheckIn: { type: String, default: '' },
    requestedCheckOut: { type: String, default: '' },
    requestedWorkMode: {
      type: String,
      enum: ['Office', 'Remote'],
      default: 'Office',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminComment: { type: String, default: '' },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open request per person per day; resolved ones may repeat.
attendanceRequestSchema.index(
  { userId: 1, date: 1, status: 1 },
  { partialFilterExpression: { status: 'Pending' }, unique: true }
);

module.exports = mongoose.model('AttendanceRequest', attendanceRequestSchema);
