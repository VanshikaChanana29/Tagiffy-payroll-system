const MiscExpense = require('../models/MiscExpense');
const { MISC_EXPENSE_CATEGORIES } = require('../models/MiscExpense');
const Salary = require('../models/Salary');
const Reimbursement = require('../models/Reimbursement');
const {
  EXPENSES_FOLDER,
  MAX_EXPENSE_FILES,
  isRealPdf,
  isRealImage,
} = require('../middleware/upload');
const { saveFile, deleteFile, sendStoredFile } = require('../utils/fileStorage');

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Same content check as reimbursement receipts: a renamed file is rejected.
const isRealSlip = (buffer, mimeType) =>
  mimeType === 'application/pdf' ? isRealPdf(buffer) : isRealImage(buffer);

const isValidDateStr = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Reads ?month=&year= (defaulting to this month) into YYYY-MM-DD bounds. */
const parsePeriod = (query) => {
  const now = new Date();
  const month = query.month !== undefined ? Number(query.month) : now.getMonth() + 1;
  const year = query.year !== undefined ? Number(query.year) : now.getFullYear();
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: 'Please choose a valid month and year.' };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  return { month, year, start, end };
};

const inPeriod = (period) => ({ expenseDate: { $gte: period.start, $lt: period.end } });

/** Validates the uploaded slips; returns document entries or an error message. */
const readUploadedSlips = (files = []) => {
  for (const file of files) {
    if (!isRealSlip(file.buffer, file.mimetype)) {
      return { error: `'${file.originalname}' does not look like a valid PDF or image.` };
    }
  }
  return {
    documents: files.map((file) => ({
      storedName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      uploadedAt: new Date(),
    })),
  };
};

const saveSlips = (files = []) =>
  Promise.all(files.map((f) => saveFile(EXPENSES_FOLDER, f.filename, f.buffer, f.mimetype)));

const removeSlips = (documents = []) =>
  documents.forEach((d) => deleteFile(EXPENSES_FOLDER, d.storedName));

/** Totals for a month: the misc entries plus the rest of the company's spend. */
const buildCompanySummary = async (period) => {
  const [miscAgg, payroll, reimbursements] = await Promise.all([
    MiscExpense.aggregate([
      { $match: inPeriod(period) },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Salary.find({ month: period.month, year: period.year })
      .select('grossSalary netSalary paymentStatus')
      .lean(),
    Reimbursement.find({ status: 'Approved', ...inPeriod(period) }).select('amount').lean(),
  ]);

  const misc = round(miscAgg.reduce((s, c) => s + c.total, 0));
  const payrollGross = round(payroll.reduce((s, r) => s + (r.grossSalary || 0), 0));
  const payrollNet = round(payroll.reduce((s, r) => s + (r.netSalary || 0), 0));
  const reimbursementTotal = round(reimbursements.reduce((s, r) => s + (r.amount || 0), 0));

  return {
    month: period.month,
    year: period.year,
    payroll: {
      gross: payrollGross,
      net: payrollNet,
      deductions: round(payrollGross - payrollNet),
      payslips: payroll.length,
    },
    reimbursements: { total: reimbursementTotal, count: reimbursements.length },
    misc: {
      total: misc,
      count: miscAgg.reduce((s, c) => s + c.count, 0),
      byCategory: miscAgg.map((c) => ({ category: c._id, total: round(c.total), count: c.count })),
    },
    // What the company spent this month: salaries (gross, before employee
    // deductions), approved reimbursements, and miscellaneous expenses.
    totalCompanyExpense: round(payrollGross + reimbursementTotal + misc),
  };
};

// @desc    List a month's miscellaneous expenses with their total
// @route   GET /api/misc-expenses?month=&year=&category=&search=
// @access  Private (Admin / Super Admin)
const getMiscExpenses = async (req, res) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ success: false, message: period.error });

    const query = inPeriod(period);
    if (req.query.category && req.query.category !== 'All') query.category = req.query.category;
    if (req.query.search) {
      const s = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ category: new RegExp(s, 'i') }, { description: new RegExp(s, 'i') }];
    }

    const expenses = await MiscExpense.find(query)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ expenseDate: -1, createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      month: period.month,
      year: period.year,
      count: expenses.length,
      total: round(expenses.reduce((s, e) => s + e.amount, 0)),
      categories: MISC_EXPENSE_CATEGORIES,
      expenses,
    });
  } catch (error) {
    console.error('Get Misc Expenses Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load expenses', error: error.message });
  }
};

// @desc    Miscellaneous expense total for each month of a year
// @route   GET /api/misc-expenses/monthly?year=
// @access  Private (Admin / Super Admin)
const getMonthlyTotals = async (req, res) => {
  try {
    const year = req.query.year !== undefined ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ success: false, message: 'Please choose a valid year.' });
    }

    const agg = await MiscExpense.aggregate([
      { $match: { expenseDate: { $gte: `${year}-01-01`, $lt: `${year + 1}-01-01` } } },
      {
        $group: {
          _id: { $toInt: { $substrBytes: ['$expenseDate', 5, 2] } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);
    const byMonth = new Map(agg.map((m) => [m._id, m]));
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      total: round(byMonth.get(i + 1)?.total || 0),
      count: byMonth.get(i + 1)?.count || 0,
    }));

    res.status(200).json({
      success: true,
      year,
      yearTotal: round(months.reduce((s, m) => s + m.total, 0)),
      months,
    });
  } catch (error) {
    console.error('Get Misc Expense Monthly Totals Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load monthly totals', error: error.message });
  }
};

// @desc    Company-wide expense summary for a month (payroll + reimbursements + misc)
// @route   GET /api/misc-expenses/summary?month=&year=
// @access  Private (Admin / Super Admin)
const getCompanySummary = async (req, res) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ success: false, message: period.error });
    res.status(200).json({ success: true, summary: await buildCompanySummary(period) });
  } catch (error) {
    console.error('Get Company Expense Summary Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load expense summary', error: error.message });
  }
};

/** Shared field checks for create and update; returns { values } or { error }. */
const readExpenseFields = (body, { partial = false } = {}) => {
  const values = {};
  if (!partial || body.category !== undefined) {
    const category = String(body.category || '').trim();
    if (!category) return { error: 'Please enter the expense name / category.' };
    if (category.length > 100) return { error: 'Expense name is too long (max 100 characters).' };
    values.category = category;
  }
  if (!partial || body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be greater than 0.' };
    values.amount = round(amount);
  }
  if (!partial || body.expenseDate !== undefined) {
    if (!isValidDateStr(body.expenseDate)) return { error: 'Please choose a valid expense date.' };
    values.expenseDate = body.expenseDate;
  }
  if (body.description !== undefined) values.description = String(body.description).trim().slice(0, 1000);
  return { values };
};

// @desc    Add a miscellaneous expense (slips optional)
// @route   POST /api/misc-expenses   (multipart, files in "documents")
// @access  Private (Admin / Super Admin)
const createMiscExpense = async (req, res) => {
  try {
    const { values, error } = readExpenseFields(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const slips = readUploadedSlips(req.files);
    if (slips.error) return res.status(400).json({ success: false, message: slips.error });

    await saveSlips(req.files);
    let expense;
    try {
      expense = await MiscExpense.create({
        ...values,
        documents: slips.documents,
        createdBy: req.user._id,
      });
    } catch (err) {
      removeSlips(slips.documents);
      throw err;
    }

    res.status(201).json({
      success: true,
      message: `Added ${expense.category} expense`,
      expense,
    });
  } catch (error) {
    console.error('Create Misc Expense Error:', error);
    res.status(500).json({ success: false, message: 'Failed to add expense', error: error.message });
  }
};

// @desc    Edit a miscellaneous expense; new files are added to its slips
// @route   PUT /api/misc-expenses/:id   (multipart, files in "documents")
// @access  Private (Admin / Super Admin)
const updateMiscExpense = async (req, res) => {
  try {
    const expense = await MiscExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

    const { values, error } = readExpenseFields(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, message: error });

    const slips = readUploadedSlips(req.files);
    if (slips.error) return res.status(400).json({ success: false, message: slips.error });
    if (expense.documents.length + slips.documents.length > MAX_EXPENSE_FILES) {
      return res.status(400).json({
        success: false,
        message: `An expense can have at most ${MAX_EXPENSE_FILES} attachments. Remove one first.`,
      });
    }

    await saveSlips(req.files);
    Object.assign(expense, values);
    expense.documents.push(...slips.documents);
    expense.updatedBy = req.user._id;
    try {
      await expense.save();
    } catch (err) {
      removeSlips(slips.documents);
      throw err;
    }

    res.status(200).json({ success: true, message: 'Expense updated', expense });
  } catch (error) {
    console.error('Update Misc Expense Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update expense', error: error.message });
  }
};

// @desc    Delete a miscellaneous expense and its slips
// @route   DELETE /api/misc-expenses/:id
// @access  Private (Admin / Super Admin)
const deleteMiscExpense = async (req, res) => {
  try {
    const expense = await MiscExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

    await expense.deleteOne();
    removeSlips(expense.documents);

    res.status(200).json({ success: true, message: `Deleted ${expense.category} expense` });
  } catch (error) {
    console.error('Delete Misc Expense Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expense', error: error.message });
  }
};

// @desc    Remove one attached slip from an expense
// @route   DELETE /api/misc-expenses/:id/documents/:docId
// @access  Private (Admin / Super Admin)
const deleteExpenseDocument = async (req, res) => {
  try {
    const expense = await MiscExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

    const doc = expense.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const { storedName } = doc;
    doc.deleteOne();
    expense.updatedBy = req.user._id;
    await expense.save();
    deleteFile(EXPENSES_FOLDER, storedName);

    res.status(200).json({ success: true, message: 'Attachment removed', expense });
  } catch (error) {
    console.error('Delete Expense Document Error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove attachment', error: error.message });
  }
};

// @desc    Download one attached slip
// @route   GET /api/misc-expenses/:id/documents/:docId
// @access  Private (Admin / Super Admin)
const downloadExpenseDocument = async (req, res) => {
  try {
    const expense = await MiscExpense.findById(req.params.id);
    const doc = expense?.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const sent = await sendStoredFile(res, EXPENSES_FOLDER, doc.storedName, {
      contentType: doc.mimeType || 'application/octet-stream',
      downloadName: doc.originalName || 'attachment',
    });
    if (!sent) {
      return res.status(404).json({ success: false, message: 'The stored file is missing from the server.' });
    }
  } catch (error) {
    console.error('Download Expense Document Error:', error);
    if (res.headersSent) return res.end();
    res.status(500).json({ success: false, message: 'Failed to download attachment', error: error.message });
  }
};

module.exports = {
  getMiscExpenses,
  getMonthlyTotals,
  getCompanySummary,
  createMiscExpense,
  updateMiscExpense,
  deleteMiscExpense,
  deleteExpenseDocument,
  downloadExpenseDocument,
};
