const MonthlyIncentive = require('../models/MonthlyIncentive');
const Salary = require('../models/Salary');
const User = require('../models/User');
const { round } = require('../utils/salaryStructure');
const {
  parseIncentiveSheet,
  parseAmount,
  buildIncentiveTemplateWorkbook,
} = require('../utils/incentiveSheet');

const parseCycle = (source) => {
  const month = parseInt(source.month, 10);
  const year = parseInt(source.year, 10);
  if (!month || !year || month < 1 || month > 12) return null;
  return { month, year };
};

/**
 * Uploaded incentives for one month, keyed by userId, for the payroll run.
 */
const getIncentivesByUser = async (month, year) => {
  const incentives = await MonthlyIncentive.find({ month, year });
  return incentives.reduce((map, inc) => {
    map[inc.userId.toString()] = inc.amount;
    return map;
  }, {});
};

// Keeps an existing payslip in step with the uploaded figure. The pre-save
// hook recalculates gross and net.
const applyToExistingPayslip = async (userId, month, year, amount) => {
  const payslip = await Salary.findOne({ userId, month, year });
  if (!payslip || (payslip.incentive || 0) === amount) return false;
  payslip.incentive = amount;
  await payslip.save();
  return true;
};

// @desc    Uploaded incentives for a month
// @route   GET /api/payroll/incentives?month=&year=
// @access  Private (Admin only)
const getIncentives = async (req, res) => {
  try {
    const cycle = parseCycle(req.query);
    if (!cycle) {
      return res.status(400).json({ success: false, message: 'Please provide a valid month and year.' });
    }

    const incentives = await MonthlyIncentive.find(cycle)
      .populate('userId', 'name email employeeId department')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      incentives,
      total: round(incentives.reduce((sum, i) => sum + i.amount, 0)),
    });
  } catch (error) {
    console.error('Get Incentives Error:', error);
    res.status(500).json({ success: false, message: 'Failed to load incentives', error: error.message });
  }
};

// @desc    Download the incentive sheet, pre-filled with active employees
// @route   GET /api/payroll/incentives/template
// @access  Private (Admin only)
const downloadIncentiveTemplate = async (req, res) => {
  try {
    const employees = await User.find({ status: 'Active' }).select('name email').sort({ name: 1 });
    const buffer = buildIncentiveTemplateWorkbook(employees);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="incentive_upload_template.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Download Incentive Template Error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate the template file', error: error.message });
  }
};

// @desc    Upload incentives for a month from an Excel/CSV sheet
// @route   POST /api/payroll/incentives/upload
// @access  Private (Admin only)
//
// Each row sets that employee's incentive for the month (replacing any earlier
// upload). A blank amount is ignored, 0 removes the incentive. Bad rows are
// reported with their row number and never stop the rest.
const uploadIncentives = async (req, res) => {
  try {
    const cycle = parseCycle(req.body);
    if (!cycle) {
      return res.status(400).json({ success: false, message: 'Please choose a valid month and year.' });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please choose an Excel (.xlsx/.xls) or .csv file to upload.',
      });
    }

    let parsed;
    try {
      parsed = parseIncentiveSheet(req.file.buffer);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Could not read that file. Please upload a valid .xlsx, .xls, or .csv file.',
      });
    }

    if (parsed.missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The sheet needs these columns: ${parsed.missingColumns.join(', ')}.`,
      });
    }

    const users = await User.find().select('name email status');
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const saved = [];
    const removed = [];
    const failed = [];
    let ignored = 0;
    let payslipsUpdated = 0;
    const seen = new Set();

    for (const { rowNumber, data } of parsed.rows) {
      const email = String(data.email || '').trim().toLowerCase();
      const amount = parseAmount(data.amount);
      const fail = (reason) => failed.push({ row: rowNumber, email: email || data.name || '', reason });

      if (amount === null) {
        ignored += 1;
        continue;
      }
      if (!email) {
        fail('Email is missing');
        continue;
      }
      if (!Number.isFinite(amount) || amount < 0) {
        fail(`"${data.amount}" is not a valid amount`);
        continue;
      }
      if (seen.has(email)) {
        fail('This email appears more than once in the sheet');
        continue;
      }
      seen.add(email);

      const user = userByEmail.get(email);
      if (!user) {
        fail('No employee with this email');
        continue;
      }
      if (user.status !== 'Active') {
        fail('Employee is not active');
        continue;
      }

      const value = round(amount);
      if (value === 0) {
        await MonthlyIncentive.deleteOne({ userId: user._id, ...cycle });
        removed.push({ name: user.name, email: user.email });
      } else {
        await MonthlyIncentive.findOneAndUpdate(
          { userId: user._id, ...cycle },
          { amount: value, remarks: String(data.remarks || ''), uploadedBy: req.user._id },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        saved.push({ name: user.name, email: user.email, amount: value });
      }

      if (await applyToExistingPayslip(user._id, cycle.month, cycle.year, value)) {
        payslipsUpdated += 1;
      }
    }

    res.status(200).json({
      success: true,
      message: `${saved.length} incentive(s) saved${removed.length ? `, ${removed.length} removed` : ''}${
        failed.length ? `, ${failed.length} row(s) skipped` : ''
      }.`,
      savedCount: saved.length,
      removedCount: removed.length,
      failedCount: failed.length,
      ignoredCount: ignored,
      payslipsUpdated,
      total: round(saved.reduce((sum, s) => sum + s.amount, 0)),
      failed,
    });
  } catch (error) {
    console.error('Upload Incentives Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload incentives', error: error.message });
  }
};

// @desc    Remove an uploaded incentive (and from the payslip, if generated)
// @route   DELETE /api/payroll/incentives/:id
// @access  Private (Admin only)
const deleteIncentive = async (req, res) => {
  try {
    const incentive = await MonthlyIncentive.findById(req.params.id);
    if (!incentive) {
      return res.status(404).json({ success: false, message: 'Incentive not found' });
    }
    await incentive.deleteOne();
    await applyToExistingPayslip(incentive.userId, incentive.month, incentive.year, 0);
    res.status(200).json({ success: true, message: 'Incentive removed' });
  } catch (error) {
    console.error('Delete Incentive Error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove incentive', error: error.message });
  }
};

module.exports = {
  getIncentives,
  downloadIncentiveTemplate,
  uploadIncentives,
  deleteIncentive,
  getIncentivesByUser,
};
