const mongoose = require('mongoose');

// Salary paid to an employee ahead of payday. The payroll run takes it back
// from the next payslip(s), so the same money is never paid out twice.
const salaryAdvanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
    },
    givenOn: {
      type: String, // Format: YYYY-MM-DD
      required: [true, 'Date the advance was given is required'],
    },
    // How much the payroll run has already taken back. An advance bigger than
    // one month's pay is recovered across several payslips.
    recoveredAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Pending', 'Recovered', 'Cancelled'],
      default: 'Pending',
    },
    // Every payslip that recovered part of this advance.
    recoveries: [
      {
        salaryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salary' },
        month: Number,
        year: Number,
        amount: Number,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

salaryAdvanceSchema.virtual('outstanding').get(function () {
  return Math.max(0, (this.amount || 0) - (this.recoveredAmount || 0));
});

salaryAdvanceSchema.set('toJSON', { virtuals: true });
salaryAdvanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SalaryAdvance', salaryAdvanceSchema);
