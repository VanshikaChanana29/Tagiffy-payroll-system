const mongoose = require('mongoose');

// Suggestions shown in the form; any other category name is allowed too.
const MISC_EXPENSE_CATEGORIES = [
  'Building Rent',
  'Electricity',
  'Water',
  'Internet & Phone',
  'Maintenance',
  'Office Supplies',
  'Housekeeping',
  'Other',
];

// A company running cost that isn't payroll or an employee reimbursement,
// e.g. rent or the electricity bill. Admin / super admin only.
const miscExpenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: [true, 'Expense name / category is required'],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    // The day the expense belongs to (YYYY-MM-DD). Its month decides which
    // monthly total it counts towards.
    expenseDate: {
      type: String,
      required: [true, 'Expense date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Expense date must be YYYY-MM-DD'],
      index: true,
    },
    // Optional bills / receipts / payment slips.
    documents: [
      {
        storedName: { type: String, required: true },
        originalName: { type: String, default: '' },
        mimeType: { type: String, default: '' },
        fileSizeBytes: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MiscExpense', miscExpenseSchema);
module.exports.MISC_EXPENSE_CATEGORIES = MISC_EXPENSE_CATEGORIES;
