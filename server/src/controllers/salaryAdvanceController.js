const mongoose = require('mongoose');
const SalaryAdvance = require('../models/SalaryAdvance');
const User = require('../models/User');

// @desc    List salary advances, optionally for one employee or status
// @route   GET /api/salary-advances
// @access  Private (Admin / Super Admin)
const getSalaryAdvances = async (req, res) => {
  try {
    const { userId, status } = req.query;

    const query = {};
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ success: false, message: 'Invalid employee id' });
      }
      query.userId = userId;
    }
    if (status && status !== 'All') query.status = status;

    const advances = await SalaryAdvance.find(query)
      .populate('userId', 'name employeeId department designation avatar')
      .populate('createdBy', 'name')
      .populate('cancelledBy', 'name')
      .sort({ createdAt: -1 });

    const pending = advances.filter((a) => a.status === 'Pending');
    const stats = {
      total: advances.length,
      pending: pending.length,
      outstandingAmount: pending.reduce((sum, a) => sum + a.outstanding, 0),
    };

    res.status(200).json({ success: true, stats, advances });
  } catch (error) {
    console.error('Get Salary Advances Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve salary advances',
      error: error.message,
    });
  }
};

// @desc    Record salary given to an employee in advance
// @route   POST /api/salary-advances
// @access  Private (Admin / Super Admin)
const createSalaryAdvance = async (req, res) => {
  try {
    const { userId, amount, reason, givenOn } = req.body;

    if (!userId || !amount || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the employee, amount and reason for the advance',
      });
    }

    const amountNum = Math.round(Number(amount));
    if (!(amountNum > 0)) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    if (givenOn && !/^\d{4}-\d{2}-\d{2}$/.test(givenOn)) {
      return res.status(400).json({ success: false, message: 'Date must be in YYYY-MM-DD format' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee id' });
    }
    const employee = await User.findById(userId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const advance = await SalaryAdvance.create({
      userId,
      amount: amountNum,
      reason: reason.trim(),
      givenOn: givenOn || new Date().toISOString().slice(0, 10),
      createdBy: req.user._id,
    });
    await advance.populate('userId', 'name employeeId department designation avatar');
    await advance.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: `Advance of ₹${amountNum.toLocaleString('en-IN')} recorded for ${employee.name}. It will be deducted in the next payroll run.`,
      advance,
    });
  } catch (error) {
    console.error('Create Salary Advance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record salary advance',
      error: error.message,
    });
  }
};

// @desc    Cancel an advance entered by mistake; stops any further recovery
// @route   PUT /api/salary-advances/:id/cancel
// @access  Private (Admin / Super Admin)
const cancelSalaryAdvance = async (req, res) => {
  try {
    const advance = await SalaryAdvance.findById(req.params.id);
    if (!advance) {
      return res.status(404).json({ success: false, message: 'Salary advance not found' });
    }

    if (advance.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `This advance is already ${advance.status.toLowerCase()}.`,
      });
    }

    advance.status = 'Cancelled';
    advance.cancelledBy = req.user._id;
    advance.cancelledAt = new Date();
    await advance.save();

    res.status(200).json({
      success: true,
      message:
        advance.recoveredAmount > 0
          ? `Advance cancelled. ₹${advance.recoveredAmount.toLocaleString('en-IN')} already recovered stays on past payslips; nothing more will be deducted.`
          : 'Advance cancelled. It will not be deducted from salary.',
      advance,
    });
  } catch (error) {
    console.error('Cancel Salary Advance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel salary advance',
      error: error.message,
    });
  }
};

/**
 * Plans how much of an employee's outstanding advances to take back from a
 * payslip whose net pay (before recovery) is `available`. Oldest advance
 * first; whatever does not fit carries over to the next month.
 */
const planAdvanceRecovery = (advances, available) => {
  let remaining = Math.max(0, Math.round(available));
  const allocations = [];
  for (const advance of advances) {
    if (remaining <= 0) break;
    const take = Math.min(advance.outstanding, remaining);
    if (take > 0) {
      allocations.push({ advanceId: advance._id, amount: take, reason: advance.reason });
      remaining -= take;
    }
  }
  const total = allocations.reduce((sum, a) => sum + a.amount, 0);
  const outstanding = advances.reduce((sum, a) => sum + a.outstanding, 0);
  return { total, allocations, carryForward: outstanding - total };
};

// Pending advances for the given employees, oldest first, grouped by userId.
const getPendingAdvancesByUser = async (userIds) => {
  const advances = await SalaryAdvance.find({
    userId: { $in: userIds },
    status: 'Pending',
  }).sort({ givenOn: 1, createdAt: 1 });

  const byUser = {};
  advances.forEach((a) => {
    const key = a.userId.toString();
    (byUser[key] = byUser[key] || []).push(a);
  });
  return byUser;
};

// Marks the planned amounts as recovered against a saved payslip.
const recordAdvanceRecovery = async (allocations, salary) => {
  for (const { advanceId, amount } of allocations) {
    const advance = await SalaryAdvance.findById(advanceId);
    if (!advance || advance.status !== 'Pending') continue;
    advance.recoveredAmount = (advance.recoveredAmount || 0) + amount;
    advance.recoveries.push({
      salaryId: salary._id,
      month: salary.month,
      year: salary.year,
      amount,
    });
    if (advance.recoveredAmount >= advance.amount) advance.status = 'Recovered';
    await advance.save();
  }
};

module.exports = {
  getSalaryAdvances,
  createSalaryAdvance,
  cancelSalaryAdvance,
  planAdvanceRecovery,
  getPendingAdvancesByUser,
  recordAdvanceRecovery,
};
