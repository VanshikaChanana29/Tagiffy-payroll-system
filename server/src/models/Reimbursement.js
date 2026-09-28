const mongoose = require('mongoose');

const REIMBURSEMENT_CATEGORIES = [
  'Travel',
  'Food',
  'Accommodation',
  'Office Supplies',
  'Client Entertainment',
  'Other',
];

const reimbursementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: REIMBURSEMENT_CATEGORIES,
      required: [true, 'Category is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    expenseDate: {
      type: String, // Format: YYYY-MM-DD
      required: [true, 'Expense date is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    // Optional — a request without a receipt is still submittable; HR can
    // reject it on review if proof is required for that category.
    receipt: {
      storedName: { type: String, default: '' },
      originalName: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      fileSizeBytes: { type: Number, default: 0 },
      uploadedAt: { type: Date, default: null },
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

module.exports = mongoose.model('Reimbursement', reimbursementSchema);
module.exports.REIMBURSEMENT_CATEGORIES = REIMBURSEMENT_CATEGORIES;
