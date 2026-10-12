const express = require('express');
const router = express.Router();
const {
  getMiscExpenses,
  getMonthlyTotals,
  getCompanySummary,
  createMiscExpense,
  updateMiscExpense,
  deleteMiscExpense,
  deleteExpenseDocument,
  downloadExpenseDocument,
} = require('../controllers/miscExpenseController');
const { protect, authorize } = require('../middleware/auth');
const { uploadExpenseDocs } = require('../middleware/upload');

// Company running costs: admin and super admin only (super admin passes every
// authorize check). Managers and employees cannot see these.
router.use(protect, authorize('admin'));

router.get('/summary', getCompanySummary);
router.get('/monthly', getMonthlyTotals);

router.route('/')
  .get(getMiscExpenses)
  .post(uploadExpenseDocs, createMiscExpense);

router.route('/:id')
  .put(uploadExpenseDocs, updateMiscExpense)
  .delete(deleteMiscExpense);

router.route('/:id/documents/:docId')
  .get(downloadExpenseDocument)
  .delete(deleteExpenseDocument);

module.exports = router;
