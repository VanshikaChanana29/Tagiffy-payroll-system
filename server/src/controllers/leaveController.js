const Leave = require('../models/Leave');
const User = require('../models/User');
const OrgSettings = require('../models/OrgSettings');
const { countWorkingDays } = require('../utils/attendanceRules');
const { getVisibleUserIds, canManageEmployee } = require('../utils/teamScope');
const { isAdminRole } = require('../utils/roles');
const { getHolidayMap } = require('./holidayController');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');
const { parseISO, isAfter, format } = require('date-fns');

// @desc    Apply for a new leave
// @route   POST /api/leaves
// @access  Private (Employee / Admin for self)
const applyLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const { leaveType, startDate, endDate, reason } = req.body;

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Please provide leave type, start date, end date, and reason',
      });
    }

    // Validate dates
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format provided. Please use YYYY-MM-DD.',
      });
    }

    if (isAfter(start, end)) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date',
      });
    }

    // Leave is charged in working days: a Friday-to-Monday request costs two
    // days, not four, and never eats a weekend out of someone's balance.
    const settings = await OrgSettings.getSettings();
    const holidayMap = await getHolidayMap(startDate, endDate, req.user.department);
    const { workingDays: daysCount, calendarDays } = countWorkingDays(
      startDate,
      endDate,
      settings,
      holidayMap
    );

    if (daysCount < 1) {
      return res.status(400).json({
        success: false,
        message:
          'That range is entirely weekends or holidays, so there is nothing to apply for.',
      });
    }

    // Fetch user for balance check
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Validate leave balances
    if (leaveType === 'Paid') {
      const availablePaid = user.leaveBalance?.paid || 0;
      if (daysCount > availablePaid) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Paid leave balance. You requested ${daysCount} days, but only have ${availablePaid} days available.`,
        });
      }
    } else if (leaveType === 'Sick') {
      const availableSick = user.leaveBalance?.sick || 0;
      if (daysCount > availableSick) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Sick leave balance. You requested ${daysCount} days, but only have ${availableSick} days available.`,
        });
      }
    }

    // Check for overlapping active leaves (Pending or Approved)
    const overlapping = await Leave.findOne({
      userId,
      status: { $in: ['Pending', 'Approved'] },
      $or: [
        { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
      ],
    });

    if (overlapping) {
      return res.status(400).json({
        success: false,
        message: `You already have an active (${overlapping.status}) leave request overlapping from ${overlapping.startDate} to ${overlapping.endDate}.`,
      });
    }

    const newLeave = new Leave({
      userId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      calendarDays,
      reason: reason.trim(),
      status: 'Pending',
    });

    await newLeave.save();

    notify({
      recipients: await getEscalationRecipientIds(user),
      type: 'leave_applied',
      title: 'New leave request',
      message: `${user.name} applied for ${daysCount} day(s) of ${leaveType} leave (${startDate} to ${endDate}).`,
      relatedEntity: { kind: 'Leave', id: newLeave._id },
    });

    res.status(201).json({
      success: true,
      message:
        calendarDays === daysCount
          ? `Leave application for ${daysCount} day(s) submitted successfully`
          : `Leave submitted: ${calendarDays} calendar days, ${daysCount} working day(s) charged.`,
      leave: newLeave,
    });
  } catch (error) {
    console.error('Apply Leave Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit leave application',
      error: error.message,
    });
  }
};

// @desc    Get employee personal leave history & balances
// @route   GET /api/leaves/my-leaves
// @access  Private
const getMyLeaves = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;

    const user = await User.findById(userId).select('leaveBalance name employeeId');
    const leaves = await Leave.find({ userId })
      .populate('reviewedBy', 'name designation avatar')
      .sort({ createdAt: -1 });

    const stats = {
      totalApplications: leaves.length,
      pending: leaves.filter((l) => l.status === 'Pending').length,
      approved: leaves.filter((l) => l.status === 'Approved').length,
      rejected: leaves.filter((l) => l.status === 'Rejected').length,
    };

    res.status(200).json({
      success: true,
      leaveBalance: user.leaveBalance,
      stats,
      leaves,
    });
  } catch (error) {
    console.error('Get My Leaves Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve leave history',
      error: error.message,
    });
  }
};

// @desc    Get all leave requests across organization (Admin only)
// @route   GET /api/leaves/all
// @access  Private (Admin only)
const getAllLeaves = async (req, res) => {
  try {
    const { status, department, search } = req.query;

    const query = {};
    if (status && status !== 'All') {
      query.status = status;
    }

    // Managers see their own team's requests; admins see everyone's.
    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds !== null) {
      query.userId = { $in: visibleIds };
    }

    let leaves = await Leave.find(query)
      .populate('userId', 'name email employeeId department designation avatar leaveBalance')
      .populate('reviewedBy', 'name designation')
      .sort({ createdAt: -1 });

    // Filter populated user fields (department, search) in memory
    if (department && department !== 'All') {
      leaves = leaves.filter(
        (l) => l.userId && l.userId.department === department
      );
    }

    if (search) {
      const s = search.toLowerCase().trim();
      leaves = leaves.filter(
        (l) =>
          l.userId &&
          (l.userId.name.toLowerCase().includes(s) ||
            l.userId.email.toLowerCase().includes(s) ||
            l.userId.employeeId.toLowerCase().includes(s) ||
            l.reason.toLowerCase().includes(s))
      );
    }

    const scopeFilter = visibleIds !== null ? { userId: { $in: visibleIds } } : {};
    const allLeavesCount = await Leave.countDocuments(scopeFilter);
    const pendingCount = await Leave.countDocuments({ ...scopeFilter, status: 'Pending' });
    const approvedCount = await Leave.countDocuments({ ...scopeFilter, status: 'Approved' });
    const rejectedCount = await Leave.countDocuments({ ...scopeFilter, status: 'Rejected' });

    res.status(200).json({
      success: true,
      count: leaves.length,
      stats: {
        total: allLeavesCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      leaves,
    });
  } catch (error) {
    console.error('Get All Leaves Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve leave applications',
      error: error.message,
    });
  }
};

// @desc    Approve or Reject leave request (Admin only)
// @route   PUT /api/leaves/:id/status
// @access  Private (Admin only)
const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment = '' } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either Approved or Rejected',
      });
    }

    // A refusal an employee cannot act on is not a decision. Same rule as
    // document rejections and attendance corrections.
    if (status === 'Rejected' && !adminComment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please give a reason so the employee understands the decision.',
      });
    }

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leave.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This request was cancelled by the employee and can no longer be reviewed.',
      });
    }

    const previousStatus = leave.status;
    const employee = await User.findById(leave.userId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    if (!(await canManageEmployee(req.user, leave.userId))) {
      return res.status(403).json({
        success: false,
        message: 'You can only decide on leave for people who report to you.',
      });
    }

    // Approving your own leave is not a decision, it is a conflict of interest.
    if (leave.userId.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot approve or reject your own leave request.',
      });
    }

    // Handle Leave Balance adjustments
    if (status === 'Approved' && previousStatus !== 'Approved') {
      // Deduct balance on transition to Approved
      if (leave.leaveType === 'Paid') {
        const available = employee.leaveBalance?.paid || 0;
        if (leave.daysCount > available) {
          return res.status(400).json({
            success: false,
            message: `Cannot approve. Employee only has ${available} Paid leave days available.`,
          });
        }
        employee.leaveBalance.paid -= leave.daysCount;
      } else if (leave.leaveType === 'Sick') {
        const available = employee.leaveBalance?.sick || 0;
        if (leave.daysCount > available) {
          return res.status(400).json({
            success: false,
            message: `Cannot approve. Employee only has ${available} Sick leave days available.`,
          });
        }
        employee.leaveBalance.sick -= leave.daysCount;
      }
      await employee.save();
    } else if (status === 'Rejected' && previousStatus === 'Approved') {
      // Refund balance if changing from Approved to Rejected
      if (leave.leaveType === 'Paid') {
        employee.leaveBalance.paid += leave.daysCount;
      } else if (leave.leaveType === 'Sick') {
        employee.leaveBalance.sick += leave.daysCount;
      }
      await employee.save();
    }

    // Update leave request
    leave.status = status;
    leave.adminComment = adminComment.trim();
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();

    await leave.save();

    notify({
      recipients: [employee._id],
      type: status === 'Approved' ? 'leave_approved' : 'leave_rejected',
      title: `Leave ${status.toLowerCase()}`,
      message:
        status === 'Approved'
          ? `Your ${leave.leaveType} leave from ${leave.startDate} to ${leave.endDate} has been approved.`
          : `Your ${leave.leaveType} leave from ${leave.startDate} to ${leave.endDate} was rejected: ${adminComment.trim()}`,
      relatedEntity: { kind: 'Leave', id: leave._id },
    });

    res.status(200).json({
      success: true,
      message: `Leave request for ${employee.name} has been ${status.toLowerCase()} successfully`,
      leave,
      updatedBalance: employee.leaveBalance,
    });
  } catch (error) {
    console.error('Update Leave Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leave status',
      error: error.message,
    });
  }
};


// @desc    Employee cancels their own leave request
// @route   PUT /api/leaves/:id/cancel
// @access  Private (owner only)
//
// Applied by mistake? The employee withdraws it themselves instead of asking HR
// to reject it. Approved leave can still be withdrawn until it starts, and the
// balance is handed back.
const cancelMyLeave = async (req, res) => {
  try {
    const { id } = req.params;

    const leave = await Leave.findById(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leave.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own leave requests.',
      });
    }

    if (leave.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'This request is already cancelled.',
      });
    }

    if (leave.status === 'Rejected') {
      return res.status(400).json({
        success: false,
        message: 'A rejected request cannot be cancelled.',
      });
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    if (leave.status === 'Approved') {
      // Once the leave has begun, attendance already reflects it, so HR has to
      // be the one to unwind it.
      if (leave.startDate <= todayStr) {
        return res.status(400).json({
          success: false,
          message:
            'This leave has already started. Please ask HR to reverse it instead.',
        });
      }

      // Give the balance back, mirroring the approval deduction.
      const employee = await User.findById(leave.userId);
      if (employee) {
        if (leave.leaveType === 'Paid') {
          employee.leaveBalance.paid += leave.daysCount;
        } else if (leave.leaveType === 'Sick') {
          employee.leaveBalance.sick += leave.daysCount;
        }
        await employee.save();
      }
    }

    leave.status = 'Cancelled';
    leave.cancelledAt = new Date();
    await leave.save();

    const employee = await User.findById(leave.userId).select('leaveBalance name reportingManager role');

    notify({
      recipients: await getEscalationRecipientIds(employee || req.user),
      type: 'leave_cancelled',
      title: 'Leave request cancelled',
      message: `${req.user.name} cancelled their ${leave.leaveType} leave request for ${leave.startDate} to ${leave.endDate}.`,
      relatedEntity: { kind: 'Leave', id: leave._id },
    });

    res.status(200).json({
      success: true,
      message: `Leave request for ${leave.startDate} cancelled.`,
      leave,
      updatedBalance: employee ? employee.leaveBalance : null,
    });
  } catch (error) {
    console.error('Cancel Leave Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel leave request',
      error: error.message,
    });
  }
};

module.exports = {
  applyLeave,
  cancelMyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus,
};
