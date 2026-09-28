const Leave = require('../models/Leave');
const User = require('../models/User');
const OrgSettings = require('../models/OrgSettings');
const { countWorkingDays } = require('../utils/attendanceRules');
const { getVisibleUserIds, canManageEmployee } = require('../utils/teamScope');
const { isAdminRole } = require('../utils/roles');
const { getHolidayMap } = require('./holidayController');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');
const {
  splitWorkingDaysByMonth,
  getLeaveBalance,
  withLeaveBalances,
  checkEarnedAvailability,
} = require('../utils/leavePolicy');
const { parseISO, isAfter, format } = require('date-fns');

// 'Paid' is stored, but people know it as Earned leave.
const typeLabel = (leaveType) => (leaveType === 'Paid' ? 'Earned' : leaveType);

// How a request reads in messages: "Earned leave", "Unpaid leave", "Work From Home".
const requestLabel = (leaveType) => (leaveType === 'WFH' ? 'Work From Home' : `${typeLabel(leaveType)} leave`);

// @desc    Apply for a new leave
// @route   POST /api/leaves
// @access  Private (Employee / Admin for self)
const applyLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, reason } = req.body;
    // The app calls it Earned leave; it is stored as 'Paid'.
    const leaveType = req.body.leaveType === 'Earned' ? 'Paid' : req.body.leaveType;
    const isWfh = leaveType === 'WFH';

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

    if (!['Paid', 'Unpaid', 'WFH'].includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: 'Leave type must be Earned, Unpaid or Work From Home. Sick leave is no longer available.',
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
      holidayMap,
      req.user.weeklyOffDays
    );

    if (daysCount < 1) {
      return res.status(400).json({
        success: false,
        message:
          'That range is entirely weekends or holidays, so there is nothing to apply for.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Earned leave lapses monthly, so each month the request touches is checked
    // against that month's own credit. Pending requests already hold their days.
    const monthlyDays = splitWorkingDaysByMonth(
      startDate,
      endDate,
      settings,
      holidayMap,
      req.user.weeklyOffDays
    );
    if (leaveType === 'Paid') {
      const shortfall = await checkEarnedAvailability(user, monthlyDays);
      if (shortfall) {
        return res.status(400).json({ success: false, message: shortfall });
      }
    }

    // Check for overlapping active leaves (Pending or Approved). WFH counts too:
    // a day can't be both Work From Home and leave.
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
        message: `You already have an active (${overlapping.status}) ${requestLabel(overlapping.leaveType)} request overlapping from ${overlapping.startDate} to ${overlapping.endDate}.`,
      });
    }

    const newLeave = new Leave({
      userId,
      leaveType,
      startDate,
      endDate,
      daysCount,
      calendarDays,
      monthlyDays,
      reason: reason.trim(),
      status: 'Pending',
    });

    await newLeave.save();

    notify({
      recipients: await getEscalationRecipientIds(user),
      type: 'leave_applied',
      title: isWfh ? 'New Work From Home request' : 'New leave request',
      message: `${user.name} applied for ${daysCount} day(s) of ${requestLabel(leaveType)} (${startDate} to ${endDate}).`,
      relatedEntity: { kind: 'Leave', id: newLeave._id },
    });

    res.status(201).json({
      success: true,
      message: isWfh
        ? `Work From Home request for ${daysCount} working day(s) submitted for approval`
        : calendarDays === daysCount
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

    const user = await User.findById(userId).select('name employeeId department joiningDate');
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
      leaveBalance: await getLeaveBalance(user),
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
      .populate('userId', 'name email employeeId department designation avatar joiningDate')
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

    // Attach each requester's live earned balance for this month.
    const requesters = [
      ...new Map(
        leaves.filter((l) => l.userId).map((l) => [l.userId._id.toString(), l.userId])
      ).values(),
    ];
    const balances = new Map(
      (await withLeaveBalances(requesters)).map((u) => [u._id.toString(), u.leaveBalance])
    );
    leaves = leaves.map((l) => {
      const obj = l.toJSON();
      if (obj.userId) obj.userId.leaveBalance = balances.get(obj.userId._id.toString());
      return obj;
    });

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

    // Balances are computed from the leaves themselves, so approving or
    // rejecting only changes status. Re-check earned leave on approval in case
    // the department's monthly credit was lowered since the request was made.
    if (status === 'Approved' && previousStatus !== 'Approved' && leave.leaveType === 'Paid') {
      const monthlyDays = leave.monthlyDays?.length
        ? leave.monthlyDays
        : [{ month: leave.startDate.slice(0, 7), days: leave.daysCount }];
      const shortfall = await checkEarnedAvailability(employee, monthlyDays, {
        excludeLeaveId: leave._id,
      });
      if (shortfall) {
        return res.status(400).json({ success: false, message: `Cannot approve. ${shortfall}` });
      }
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
      title: `${leave.leaveType === 'WFH' ? 'Work From Home' : 'Leave'} ${status.toLowerCase()}`,
      message:
        status === 'Approved'
          ? `Your ${requestLabel(leave.leaveType)} from ${leave.startDate} to ${leave.endDate} has been approved.`
          : `Your ${requestLabel(leave.leaveType)} from ${leave.startDate} to ${leave.endDate} was rejected: ${adminComment.trim()}`,
      relatedEntity: { kind: 'Leave', id: leave._id },
    });

    res.status(200).json({
      success: true,
      message: `Leave request for ${employee.name} has been ${status.toLowerCase()} successfully`,
      leave,
      updatedBalance: await getLeaveBalance(employee),
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
// to reject it. Approved leave can still be withdrawn until it starts; the days
// free up automatically since balances are computed from active leaves.
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
    }

    leave.status = 'Cancelled';
    leave.cancelledAt = new Date();
    await leave.save();

    const employee = await User.findById(leave.userId).select('name reportingManager role department joiningDate');

    notify({
      recipients: await getEscalationRecipientIds(employee || req.user),
      type: 'leave_cancelled',
      title: leave.leaveType === 'WFH' ? 'Work From Home request cancelled' : 'Leave request cancelled',
      message: `${req.user.name} cancelled their ${requestLabel(leave.leaveType)} request for ${leave.startDate} to ${leave.endDate}.`,
      relatedEntity: { kind: 'Leave', id: leave._id },
    });

    res.status(200).json({
      success: true,
      message: `Leave request for ${leave.startDate} cancelled.`,
      leave,
      updatedBalance: employee ? await getLeaveBalance(employee) : null,
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
