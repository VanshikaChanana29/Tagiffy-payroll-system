const Attendance = require('../models/Attendance');
const AttendanceRequest = require('../models/AttendanceRequest');
const Leave = require('../models/Leave');
const User = require('../models/User');
const OrgSettings = require('../models/OrgSettings');
const { applyAttendanceRules, isWorkingDay } = require('../utils/attendanceRules');
const { getVisibleUserIds, canManageEmployee } = require('../utils/teamScope');
const { isAdminRole } = require('../utils/roles');
const { getHolidayMap } = require('./holidayController');
const { buildPunchLocation, formatDistanceMeters } = require('../utils/geo');
const { notify, getEscalationRecipientIds } = require('../utils/notificationService');
const { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, subDays } = require('date-fns');

// Helper to get formatted date string YYYY-MM-DD
const getTodayDateStr = () => format(new Date(), 'yyyy-MM-dd');

// Dates an employee is on approved leave, as a { 'YYYY-MM-DD': leaveType } map.
// Approved leave must win over "Absent", otherwise the roll-call misreports
// people who are legitimately off.
const getApprovedLeaveDates = async (userId, fromDateStr, toDateStr) => {
  const leaves = await Leave.find({
    userId,
    status: 'Approved',
    startDate: { $lte: toDateStr },
    endDate: { $gte: fromDateStr },
  });

  const map = {};
  leaves.forEach((leave) => {
    const cursor = new Date(`${leave.startDate}T00:00:00`);
    const end = new Date(`${leave.endDate}T00:00:00`);
    while (cursor <= end) {
      map[format(cursor, 'yyyy-MM-dd')] = leave.leaveType;
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return map;
};

/**
 * Decides what a single calendar day should show, in priority order:
 * before joining > future > actual record > approved leave > non-working day > absent.
 */
const resolveDayStatus = ({
  date,
  dateStr,
  record,
  leaveType,
  holidayName,
  joiningDate,
  settings,
  now,
}) => {
  if (joiningDate && date < joiningDate && dateStr !== format(joiningDate, 'yyyy-MM-dd')) {
    return 'Pre-joining';
  }

  // A real punch wins: someone who worked a holiday still worked.
  if (record) return record.status;
  if (leaveType) return 'Leave';

  // Holidays and weekends are known facts about a date, so they are reported
  // whether they have happened yet or not — a holiday next month should read as
  // "Holiday", not "Upcoming".
  if (holidayName) return 'Holiday';
  if (!isWorkingDay(date, settings)) return 'Weekend';

  const todayStr = getTodayDateStr();
  if (date > now && dateStr !== todayStr) return 'Upcoming';

  return 'Absent';
};

// @desc    Check-in for today
// @route   POST /api/attendance/check-in
// @access  Private (Employee / Admin for self)
const checkIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const todayStr = getTodayDateStr();
    const { workMode = 'Office', remarks = '', location } = req.body;

    // Check if attendance already recorded today
    let attendance = await Attendance.findOne({ userId, date: todayStr });

    if (attendance && attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: `You have already checked in today at ${format(
          new Date(attendance.checkIn),
          'hh:mm a'
        )}`,
      });
    }

    const settings = await OrgSettings.getSettings();
    const checkInLocation = buildPunchLocation(location, settings);

    if (!attendance) {
      attendance = new Attendance({
        userId,
        date: todayStr,
        checkIn: new Date(),
        workMode,
        checkInLocation: checkInLocation || undefined,
        remarks: remarks || 'Checked in on time',
        status: 'Present',
      });
    } else {
      attendance.checkIn = new Date();
      attendance.workMode = workMode;
      attendance.checkInLocation = checkInLocation || undefined;
      attendance.status = 'Present';
      if (remarks) attendance.remarks = remarks;
    }

    applyAttendanceRules(attendance, settings);

    await attendance.save();

    const nearestOfficeNote = checkInLocation?.matchedLocationName
      ? ` from ${checkInLocation.matchedLocationName}`
      : ' from office';
    const awayNote = checkInLocation?.isOutsideGeofence
      ? ` · ${formatDistanceMeters(checkInLocation.distanceMeters)} away${nearestOfficeNote}`
      : '';

    if (checkInLocation?.isOutsideGeofence) {
      notify({
        recipients: await getEscalationRecipientIds(req.user),
        type: 'attendance_outside_geofence',
        title: 'Punch-in outside office location',
        message: `${req.user.name} checked in ${formatDistanceMeters(
          checkInLocation.distanceMeters
        )} away${nearestOfficeNote} at ${format(attendance.checkIn, 'hh:mm a')}.`,
        relatedEntity: { kind: 'Attendance', id: attendance._id },
      });
    }

    if (attendance.isLate) {
      notify({
        recipients: await getEscalationRecipientIds(req.user),
        type: 'attendance_late',
        title: 'Late punch-in',
        message: `${req.user.name} checked in late by ${attendance.lateMinutes} min, at ${format(
          attendance.checkIn,
          'hh:mm a'
        )}.`,
        relatedEntity: { kind: 'Attendance', id: attendance._id },
      });
    }

    res.status(200).json({
      success: true,
      message: `Punch-in recorded at ${format(attendance.checkIn, 'hh:mm a')} (${workMode})${
        attendance.isLate ? ` · late by ${attendance.lateMinutes} min` : ' · on time'
      }${awayNote}`,
      attendance,
    });
  } catch (error) {
    console.error('CheckIn Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record check-in',
      error: error.message,
    });
  }
};

// @desc    Check-out for today
// @route   POST /api/attendance/check-out
// @access  Private (Employee / Admin for self)
const checkOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const todayStr = getTodayDateStr();
    const { remarks, location } = req.body;

    const attendance = await Attendance.findOne({ userId, date: todayStr });

    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({
        success: false,
        message: 'You have not checked in today. Please check in first.',
      });
    }

    if (attendance.checkOut) {
      return res.status(400).json({
        success: false,
        message: `You have already checked out today at ${format(
          new Date(attendance.checkOut),
          'hh:mm a'
        )}`,
      });
    }

    const checkOutTime = new Date();
    attendance.checkOut = checkOutTime;

    // Calculate working hours in decimals
    const durationMs = checkOutTime - new Date(attendance.checkIn);
    const hours = Math.max(0, durationMs / (1000 * 60 * 60));
    attendance.totalHours = parseFloat(hours.toFixed(2));

    // Status, late mark, early exit and overtime all come from the org shift rules.
    const settings = await OrgSettings.getSettings();
    const checkOutLocation = buildPunchLocation(location, settings);
    if (checkOutLocation) attendance.checkOutLocation = checkOutLocation;
    applyAttendanceRules(attendance, settings);

    if (remarks) {
      attendance.remarks = attendance.remarks
        ? `${attendance.remarks} | ${remarks}`
        : remarks;
    }

    await attendance.save();

    if (checkOutLocation?.isOutsideGeofence) {
      const nearestOfficeNote = checkOutLocation.matchedLocationName
        ? ` from ${checkOutLocation.matchedLocationName}`
        : ' from office';
      notify({
        recipients: await getEscalationRecipientIds(req.user),
        type: 'attendance_outside_geofence',
        title: 'Punch-out outside office location',
        message: `${req.user.name} checked out ${formatDistanceMeters(
          checkOutLocation.distanceMeters
        )} away${nearestOfficeNote} at ${format(checkOutTime, 'hh:mm a')}.`,
        relatedEntity: { kind: 'Attendance', id: attendance._id },
      });
    }

    res.status(200).json({
      success: true,
      message: `Punch-out recorded at ${format(checkOutTime, 'hh:mm a')}. Total: ${
        attendance.totalHours
      } hrs (${attendance.status})${
        attendance.overtimeHours > 0 ? ` · ${attendance.overtimeHours} hrs overtime` : ''
      }`,
      attendance,
    });
  } catch (error) {
    console.error('CheckOut Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record check-out',
      error: error.message,
    });
  }
};

// @desc    Get today's attendance status for logged-in user
// @route   GET /api/attendance/today
// @access  Private
const getTodayStatus = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;
    const todayStr = getTodayDateStr();

    const attendance = await Attendance.findOne({ userId, date: todayStr });

    res.status(200).json({
      success: true,
      date: todayStr,
      attendance: attendance || null,
      isCheckedIn: !!(attendance && attendance.checkIn),
      isCheckedOut: !!(attendance && attendance.checkOut),
    });
  } catch (error) {
    console.error('Today Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today attendance status',
      error: error.message,
    });
  }
};

// @desc    Get personal attendance history with monthly stats
// @route   GET /api/attendance/my-history
// @access  Private
const getMyAttendanceHistory = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;
    const { month, year, limit = 30 } = req.query;

    const query = { userId };

    if (month && year) {
      const monthStr = String(month).padStart(2, '0');
      query.date = { $regex: `^${year}-${monthStr}` };
    }

    const records = await Attendance.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit, 10));

    // Summary calculation
    const totalRecords = records.length;
    const presentCount = records.filter((r) => r.status === 'Present').length;
    const halfDayCount = records.filter((r) => r.status === 'Half-day').length;
    const leaveCount = records.filter((r) => r.status === 'Leave').length;
    const totalHoursWorked = records.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);
    const avgDailyHours = totalRecords > 0 ? (totalHoursWorked / totalRecords).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      stats: {
        totalRecords,
        presentCount,
        halfDayCount,
        leaveCount,
        totalHoursWorked: totalHoursWorked.toFixed(1),
        avgDailyHours,
      },
      records,
    });
  } catch (error) {
    console.error('Attendance History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve attendance history',
      error: error.message,
    });
  }
};

// @desc    Get current or requested month attendance view (1st to last day of month)
// @route   GET /api/attendance/my-monthly
// @access  Private
const getMyMonthlyView = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;
    const { year: reqYear, month: reqMonth } = req.query;

    const now = new Date();
    const targetYear = reqYear ? parseInt(reqYear, 10) : now.getFullYear();
    const targetMonth = reqMonth ? parseInt(reqMonth, 10) - 1 : now.getMonth(); // 0-indexed for JS Date

    const targetDate = new Date(targetYear, targetMonth, 1);
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);

    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const monthPrefix = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

    const [records, settings, employee] = await Promise.all([
      Attendance.find({ userId, date: { $regex: `^${monthPrefix}` } }),
      OrgSettings.getSettings(),
      User.findById(userId).select('joiningDate name department'),
    ]);

    const leaveDates = await getApprovedLeaveDates(
      userId,
      format(monthStart, 'yyyy-MM-dd'),
      format(monthEnd, 'yyyy-MM-dd')
    );
    const holidayMap = await getHolidayMap(
      format(monthStart, 'yyyy-MM-dd'),
      format(monthEnd, 'yyyy-MM-dd'),
      employee?.department
    );

    const recordMap = {};
    records.forEach((r) => {
      recordMap[r.date] = r;
    });

    const todayStr = getTodayDateStr();
    // Nobody can be absent before their first day, so days prior to joining are
    // reported as "Pre-joining" rather than counted against them.
    const joiningDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;
    if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

    let presentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    let absentCount = 0;
    let holidayCount = 0;
    let lateCount = 0;
    let totalHoursWorked = 0;
    let totalOvertimeHours = 0;

    const monthlyDays = days.map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const record = recordMap[dateStr];
      const leaveType = leaveDates[dateStr];

      const holidayName = holidayMap[dateStr];

      const status = resolveDayStatus({
        date: d,
        dateStr,
        record,
        leaveType,
        holidayName,
        joiningDate,
        settings,
        now,
      });

      if (status === 'Holiday') holidayCount++;
      if (status === 'Present') presentCount++;
      if (status === 'Half-day') halfDayCount++;
      if (status === 'Leave') leaveCount++;
      if (status === 'Absent') absentCount++;
      if (record?.isLate) lateCount++;

      const hours = record?.totalHours || 0;
      totalHoursWorked += hours;
      totalOvertimeHours += record?.overtimeHours || 0;

      return {
        date: dateStr,
        dayName: format(d, 'EEEE'),
        shortDay: format(d, 'EEE'),
        dayNumber: parseInt(format(d, 'd'), 10),
        isToday: dateStr === todayStr,
        isWeekend: !isWorkingDay(d, settings, holidayMap),
        status,
        leaveType: leaveType || null,
        holidayName: holidayName || null,
        checkIn: record?.checkIn || null,
        checkOut: record?.checkOut || null,
        totalHours: hours,
        isLate: record?.isLate || false,
        lateMinutes: record?.lateMinutes || 0,
        earlyExitMinutes: record?.earlyExitMinutes || 0,
        overtimeHours: record?.overtimeHours || 0,
        isRegularized: record?.isRegularized || false,
        workMode: record?.workMode || (!isWorkingDay(d, settings) ? 'Weekend' : 'Office'),
        remarks: record?.remarks || '',
      };
    });

    const workedDaysCount = presentCount + halfDayCount;
    const avgDailyHours = workedDaysCount > 0 ? (totalHoursWorked / workedDaysCount).toFixed(1) : '0.0';

    res.status(200).json({
      success: true,
      year: targetYear,
      month: targetMonth + 1,
      monthName: format(monthStart, 'MMMM'),
      monthStart: format(monthStart, 'yyyy-MM-dd'),
      monthEnd: format(monthEnd, 'yyyy-MM-dd'),
      shift: {
        shiftStart: settings.shiftStart,
        shiftEnd: settings.shiftEnd,
        graceMinutes: settings.graceMinutes,
        overtimeAfterHours: settings.overtimeAfterHours,
      },
      stats: {
        totalDays: days.length,
        presentCount,
        halfDayCount,
        leaveCount,
        absentCount,
        holidayCount,
        lateCount,
        totalHoursWorked: totalHoursWorked.toFixed(1),
        totalOvertimeHours: totalOvertimeHours.toFixed(1),
        avgDailyHours,
      },
      monthlyDays,
    });
  } catch (error) {
    console.error('Monthly View Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve monthly attendance view',
      error: error.message,
    });
  }
};

// @desc    Get current week attendance view (Mon - Sun)
// @route   GET /api/attendance/my-weekly
// @access  Private
const getMyWeeklyView = async (req, res) => {
  try {
    const userId = (isAdminRole(req.user.role) && req.query.userId) ? req.query.userId : req.user._id;
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 }); // Sunday end

    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const dateStrings = days.map((d) => format(d, 'yyyy-MM-dd'));

    const [records, settings, employee] = await Promise.all([
      Attendance.find({ userId, date: { $in: dateStrings } }),
      OrgSettings.getSettings(),
      User.findById(userId).select('joiningDate department'),
    ]);

    const leaveDates = await getApprovedLeaveDates(
      userId,
      dateStrings[0],
      dateStrings[dateStrings.length - 1]
    );
    const holidayMap = await getHolidayMap(
      dateStrings[0],
      dateStrings[dateStrings.length - 1],
      employee?.department
    );

    const recordMap = {};
    records.forEach((r) => {
      recordMap[r.date] = r;
    });

    const joiningDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;
    if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

    const weeklyDays = days.map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const record = recordMap[dateStr];
      const leaveType = leaveDates[dateStr];

      const holidayName = holidayMap[dateStr];

      const status = resolveDayStatus({
        date: d,
        dateStr,
        record,
        leaveType,
        holidayName,
        joiningDate,
        settings,
        now: today,
      });

      return {
        date: dateStr,
        dayName: format(d, 'EEEE'),
        shortDay: format(d, 'EEE'),
        dayNumber: format(d, 'd'),
        isToday: dateStr === getTodayDateStr(),
        status,
        leaveType: leaveType || null,
        holidayName: holidayName || null,
        checkIn: record?.checkIn || null,
        checkOut: record?.checkOut || null,
        totalHours: record?.totalHours || 0,
        isLate: record?.isLate || false,
        lateMinutes: record?.lateMinutes || 0,
        overtimeHours: record?.overtimeHours || 0,
        workMode: record?.workMode || (!isWorkingDay(d, settings) ? 'Weekend' : 'Office'),
        remarks: record?.remarks || '',
      };
    });

    res.status(200).json({
      success: true,
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(weekEnd, 'yyyy-MM-dd'),
      weeklyDays,
    });
  } catch (error) {
    console.error('Weekly View Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve weekly attendance view',
      error: error.message,
    });
  }
};

// @desc    Get all attendance records (Admin only)
// @route   GET /api/attendance/all
// @access  Private (Admin only)
const getAllAttendance = async (req, res) => {
  try {
    const { date, department, status, search } = req.query;

    const query = {};

    // Filter by specific date (defaults to today if not provided)
    if (date) {
      query.date = date;
    } else {
      query.date = getTodayDateStr();
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds !== null) {
      query.userId = { $in: visibleIds };
    }

    let records = await Attendance.find(query)
      .populate('userId', 'name email employeeId department designation avatar status')
      .sort({ createdAt: -1 });

    // Filter populated user fields (department, search) in memory
    if (department && department !== 'All') {
      records = records.filter(
        (r) => r.userId && r.userId.department === department
      );
    }

    if (search) {
      const s = search.toLowerCase().trim();
      records = records.filter(
        (r) =>
          r.userId &&
          (r.userId.name.toLowerCase().includes(s) ||
            r.userId.email.toLowerCase().includes(s) ||
            r.userId.employeeId.toLowerCase().includes(s) ||
            r.userId.designation.toLowerCase().includes(s))
      );
    }

    // Compute organization roll-call statistics for the requested date
    const totalPresent = records.filter((r) => r.status === 'Present').length;
    const totalHalfDay = records.filter((r) => r.status === 'Half-day').length;
    const totalLeave = records.filter((r) => r.status === 'Leave').length;

    res.status(200).json({
      success: true,
      date: query.date,
      count: records.length,
      stats: {
        totalPresent,
        totalHalfDay,
        totalLeave,
      },
      records,
    });
  } catch (error) {
    console.error('Get All Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve company attendance',
      error: error.message,
    });
  }
};

// @desc    Admin regularize / update attendance record
// @route   PUT /api/attendance/:id
// @access  Private (Admin only)
const updateAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, checkIn, checkOut, totalHours, workMode, remarks } = req.body;

    const record = await Attendance.findById(id).populate(
      'userId',
      'name employeeId email'
    );
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (!(await canManageEmployee(req.user, record.userId._id || record.userId))) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit attendance for people who report to you.',
      });
    }

    if (status) record.status = status;
    if (checkIn) record.checkIn = new Date(checkIn);
    if (checkOut) record.checkOut = new Date(checkOut);
    if (totalHours !== undefined) record.totalHours = Number(totalHours);
    if (workMode) record.workMode = workMode;
    if (remarks) record.remarks = remarks;

    // Recompute hours from the punches unless an explicit total was supplied,
    // then refresh late/overtime so an edited record stays internally consistent.
    if (totalHours === undefined && record.checkIn && record.checkOut) {
      const durationMs = new Date(record.checkOut) - new Date(record.checkIn);
      record.totalHours = parseFloat(Math.max(0, durationMs / (1000 * 60 * 60)).toFixed(2));
    }

    const settings = await OrgSettings.getSettings();
    const manualStatus = status;
    applyAttendanceRules(record, settings);
    // An admin's explicit status choice wins over the derived one.
    if (manualStatus) record.status = manualStatus;

    await record.save();

    res.status(200).json({
      success: true,
      message: `Attendance for ${record.userId?.name || 'Employee'} updated successfully`,
      record,
    });
  } catch (error) {
    console.error('Update Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update attendance record',
      error: error.message,
    });
  }
};


// @desc    Employee raises a correction request for a past day
// @route   POST /api/attendance/requests
// @access  Private
const createRegularizationRequest = async (req, res) => {
  try {
    const {
      date,
      requestedCheckIn,
      requestedCheckOut,
      requestedWorkMode = 'Office',
      reason,
    } = req.body;

    if (!date || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the date and a reason for the correction.',
      });
    }

    if (!requestedCheckIn && !requestedCheckOut) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least a check-in or check-out time.',
      });
    }

    if (date > getTodayDateStr()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request a correction for a future date.',
      });
    }

    const employee = await User.findById(req.user._id).select('joiningDate');
    if (employee && employee.joiningDate) {
      const joined = format(new Date(employee.joiningDate), 'yyyy-MM-dd');
      if (date < joined) {
        return res.status(400).json({
          success: false,
          message: `That date is before your joining date (${joined}).`,
        });
      }
    }

    const existing = await AttendanceRequest.findOne({
      userId: req.user._id,
      date,
      status: 'Pending',
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `You already have a pending correction request for ${date}.`,
      });
    }

    const request = await AttendanceRequest.create({
      userId: req.user._id,
      date,
      requestedCheckIn: requestedCheckIn || '',
      requestedCheckOut: requestedCheckOut || '',
      requestedWorkMode,
      reason: reason.trim(),
    });

    notify({
      recipients: await getEscalationRecipientIds(req.user),
      type: 'regularization_requested',
      title: 'Attendance correction requested',
      message: `${req.user.name} requested an attendance correction for ${date}.`,
      relatedEntity: { kind: 'AttendanceRequest', id: request._id },
    });

    res.status(201).json({
      success: true,
      message: `Correction request for ${date} submitted for HR approval.`,
      request,
    });
  } catch (error) {
    console.error('Create Regularization Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit correction request',
      error: error.message,
    });
  }
};

// @desc    Employee's own correction requests
// @route   GET /api/attendance/requests/my
// @access  Private
const getMyRegularizationRequests = async (req, res) => {
  try {
    const userId =
      isAdminRole(req.user.role) && req.query.userId ? req.query.userId : req.user._id;

    const requests = await AttendanceRequest.find({ userId })
      .populate('reviewedBy', 'name designation')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      stats: {
        pending: requests.filter((r) => r.status === 'Pending').length,
        approved: requests.filter((r) => r.status === 'Approved').length,
        rejected: requests.filter((r) => r.status === 'Rejected').length,
      },
      requests,
    });
  } catch (error) {
    console.error('My Regularization Requests Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve correction requests',
      error: error.message,
    });
  }
};

// @desc    All correction requests across the organisation (Admin only)
// @route   GET /api/attendance/requests
// @access  Private (Admin only)
const getAllRegularizationRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;

    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds !== null) {
      query.userId = { $in: visibleIds };
    }

    const scopeFilter = visibleIds !== null ? { userId: { $in: visibleIds } } : {};

    const requests = await AttendanceRequest.find(query)
      .populate('userId', 'name email employeeId department designation avatar')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      stats: {
        pending: await AttendanceRequest.countDocuments({ ...scopeFilter, status: 'Pending' }),
        approved: await AttendanceRequest.countDocuments({ ...scopeFilter, status: 'Approved' }),
        rejected: await AttendanceRequest.countDocuments({ ...scopeFilter, status: 'Rejected' }),
      },
      requests,
    });
  } catch (error) {
    console.error('All Regularization Requests Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve correction requests',
      error: error.message,
    });
  }
};

// @desc    Approve or reject a correction request (Admin only)
// @route   PUT /api/attendance/requests/:id
// @access  Private (Admin only)
const reviewRegularizationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment = '' } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either Approved or Rejected',
      });
    }

    if (status === 'Rejected' && !adminComment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please explain why the correction is being rejected.',
      });
    }

    const request = await AttendanceRequest.findById(id).populate('userId', 'name reportingManager role');
    if (!request) {
      return res.status(404).json({ success: false, message: 'Correction request not found' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `This request was already ${request.status.toLowerCase()}.`,
      });
    }

    if (!(await canManageEmployee(req.user, request.userId._id))) {
      return res.status(403).json({
        success: false,
        message: 'You can only review corrections for people who report to you.',
      });
    }

    if (request.userId._id.toString() === req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You cannot approve your own attendance correction.',
      });
    }

    // Approving writes the requested punches onto the real attendance record.
    if (status === 'Approved') {
      const settings = await OrgSettings.getSettings();
      let record = await Attendance.findOne({
        userId: request.userId._id,
        date: request.date,
      });

      if (!record) {
        record = new Attendance({
          userId: request.userId._id,
          date: request.date,
          status: 'Present',
        });
      }

      if (request.requestedCheckIn) {
        record.checkIn = new Date(`${request.date}T${request.requestedCheckIn}:00`);
      }
      if (request.requestedCheckOut) {
        record.checkOut = new Date(`${request.date}T${request.requestedCheckOut}:00`);
      }
      record.workMode = request.requestedWorkMode;

      if (record.checkIn && record.checkOut) {
        const durationMs = new Date(record.checkOut) - new Date(record.checkIn);
        record.totalHours = parseFloat(Math.max(0, durationMs / (1000 * 60 * 60)).toFixed(2));
      }

      record.isRegularized = true;
      record.remarks = record.remarks
        ? `${record.remarks} | Regularized: ${request.reason}`
        : `Regularized: ${request.reason}`;

      applyAttendanceRules(record, settings);
      await record.save();
    }

    request.status = status;
    request.adminComment = adminComment.trim();
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    notify({
      recipients: [request.userId._id],
      type: status === 'Approved' ? 'regularization_approved' : 'regularization_rejected',
      title: `Attendance correction ${status.toLowerCase()}`,
      message:
        status === 'Approved'
          ? `Your attendance correction for ${request.date} has been approved.`
          : `Your attendance correction for ${request.date} was rejected: ${adminComment.trim()}`,
      relatedEntity: { kind: 'AttendanceRequest', id: request._id },
    });

    res.status(200).json({
      success: true,
      message: `Correction request for ${
        request.userId ? request.userId.name : 'employee'
      } (${request.date}) ${status.toLowerCase()}.`,
      request,
    });
  } catch (error) {
    console.error('Review Regularization Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review correction request',
      error: error.message,
    });
  }
};


// @desc    Reapply the current shift rules to existing attendance records
// @route   POST /api/attendance/recalculate
// @access  Private (Admin only)
//
// Late marks and overtime are stamped when someone punches, so changing the
// shift rules never silently rewrites history. This is the deliberate opposite:
// an admin explicitly reapplies the current rules, which is also how records
// created before these fields existed get backfilled.
const recalculateAttendance = async (req, res) => {
  try {
    const { fromDate, toDate, userId } = req.body || {};

    const query = {};
    if (userId) query.userId = userId;
    if (fromDate || toDate) {
      query.date = {};
      if (fromDate) query.date.$gte = fromDate;
      if (toDate) query.date.$lte = toDate;
    }

    const [records, settings] = await Promise.all([
      Attendance.find(query),
      OrgSettings.getSettings(),
    ]);

    let updated = 0;
    let lateCount = 0;
    let overtimeCount = 0;

    for (const record of records) {
      const before = {
        isLate: record.isLate,
        lateMinutes: record.lateMinutes,
        earlyExitMinutes: record.earlyExitMinutes,
        overtimeHours: record.overtimeHours,
        status: record.status,
      };

      // Trust the punches: recompute hours from them when both are present, so a
      // record cannot claim hours its own timestamps do not support.
      if (record.checkIn && record.checkOut) {
        const durationMs = new Date(record.checkOut) - new Date(record.checkIn);
        record.totalHours = parseFloat(Math.max(0, durationMs / (1000 * 60 * 60)).toFixed(2));
      }

      applyAttendanceRules(record, settings);

      const changed =
        before.isLate !== record.isLate ||
        before.lateMinutes !== record.lateMinutes ||
        before.earlyExitMinutes !== record.earlyExitMinutes ||
        before.overtimeHours !== record.overtimeHours ||
        before.status !== record.status;

      if (changed) {
        await record.save();
        updated += 1;
      }

      if (record.isLate) lateCount += 1;
      if (record.overtimeHours > 0) overtimeCount += 1;
    }

    res.status(200).json({
      success: true,
      message: `Recalculated ${records.length} record(s) against the current shift rules. ${updated} updated.`,
      stats: {
        scanned: records.length,
        updated,
        lateCount,
        overtimeCount,
      },
    });
  } catch (error) {
    console.error('Recalculate Attendance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate attendance',
      error: error.message,
    });
  }
};

module.exports = {
  recalculateAttendance,
  createRegularizationRequest,
  getMyRegularizationRequests,
  getAllRegularizationRequests,
  reviewRegularizationRequest,
  checkIn,
  checkOut,
  getTodayStatus,
  getMyAttendanceHistory,
  getMyWeeklyView,
  getMyMonthlyView,
  getAllAttendance,
  updateAttendanceRecord,
};
