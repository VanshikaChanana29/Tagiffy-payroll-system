const { format, startOfMonth, endOfMonth, eachDayOfInterval } = require('date-fns');
const User = require('../models/User');
const Salary = require('../models/Salary');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const OrgSettings = require('../models/OrgSettings');
const { isWorkingDay } = require('../utils/attendanceRules');
const { getHolidayMap } = require('./holidayController');
const { perDaySalary, round } = require('../utils/salaryStructure');
const {
  planAdvanceRecovery,
  getPendingAdvancesByUser,
  recordAdvanceRecovery,
} = require('./salaryAdvanceController');

/**
 * Loss-of-pay days for one employee in one month.
 *
 * Unpaid leave is counted only on working days, and only once — a day that is
 * both marked absent and covered by unpaid leave must not be charged twice.
 * `skipAbsences` is for attendance-exempt employees, who never punch, so a
 * missing record says nothing about whether they worked.
 */
const calculateLopDays = async (
  employee,
  monthStart,
  monthEnd,
  settings,
  holidayMap = {},
  { skipAbsences = false } = {}
) => {
  const fromStr = format(monthStart, 'yyyy-MM-dd');
  const toStr = format(monthEnd, 'yyyy-MM-dd');

  const lopDates = new Set();

  // 1. Approved unpaid leave.
  const unpaidLeaves = await Leave.find({
    userId: employee._id,
    status: 'Approved',
    leaveType: 'Unpaid',
    startDate: { $lte: toStr },
    endDate: { $gte: fromStr },
  });

  unpaidLeaves.forEach((leave) => {
    const cursor = new Date(`${leave.startDate}T00:00:00`);
    const end = new Date(`${leave.endDate}T00:00:00`);
    while (cursor <= end) {
      const dateStr = format(cursor, 'yyyy-MM-dd');
      if (
        dateStr >= fromStr &&
        dateStr <= toStr &&
        isWorkingDay(cursor, settings, holidayMap, employee.weeklyOffDays)
      ) {
        lopDates.add(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  // 2. Earned leave taken beyond the monthly credit. The leave is approved, but
  // its excess days (stored per month) are loss of pay; the last working days
  // of the leave within this month are the ones charged.
  const monthKey = fromStr.slice(0, 7);
  const paidLeaveDates = new Set();
  const paidLeaves = await Leave.find({
    userId: employee._id,
    status: 'Approved',
    leaveType: { $in: ['Paid', 'Sick'] },
    startDate: { $lte: toStr },
    endDate: { $gte: fromStr },
  });
  paidLeaves.forEach((leave) => {
    const workingDates = [];
    const cursor = new Date(`${leave.startDate}T00:00:00`);
    const end = new Date(`${leave.endDate}T00:00:00`);
    while (cursor <= end) {
      const dateStr = format(cursor, 'yyyy-MM-dd');
      paidLeaveDates.add(dateStr);
      if (
        dateStr >= fromStr &&
        dateStr <= toStr &&
        isWorkingDay(cursor, settings, holidayMap, employee.weeklyOffDays)
      ) {
        workingDates.push(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const excess = (leave.monthlyDays || []).find((m) => m.month === monthKey)?.unpaidDays || 0;
    workingDates.slice(Math.max(0, workingDates.length - Math.ceil(excess))).forEach((d) => {
      lopDates.add(d);
    });
  });

  const unpaidLeaveDays = lopDates.size;
  let absentDays = 0;

  // 3. Absent working days, if the organisation charges for them.
  if (settings.salaryStructure?.countAbsentAsLop && !skipAbsences) {

    const records = await Attendance.find({
      userId: employee._id,
      date: { $gte: fromStr, $lte: toStr },
    });
    const recordMap = {};
    records.forEach((r) => {
      recordMap[r.date] = r;
    });

    const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
    if (joiningDate) joiningDate.setHours(0, 0, 0, 0);
    const today = new Date();

    eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');

      // Skip non-working days, the future, days before joining, approved paid
      // leave, and days that already have an attendance record.
      if (!isWorkingDay(day, settings, holidayMap, employee.weeklyOffDays)) return;
      if (day > today) return;
      if (joiningDate && day < joiningDate) return;
      if (paidLeaveDates.has(dateStr)) return;
      if (lopDates.has(dateStr)) return;
      if (recordMap[dateStr]) return;

      lopDates.add(dateStr);
      absentDays += 1;
    });
  }

  return { lopDays: lopDates.size, unpaidLeaveDays, absentDays };
};

/**
 * Builds the payslip figures for one employee for one month.
 */
const buildPayslipForEmployee = async (employee, month, year, settings) => {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);

  const holidayMap = await getHolidayMap(
    format(monthStart, 'yyyy-MM-dd'),
    format(monthEnd, 'yyyy-MM-dd'),
    employee.department
  );

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const calendarDays = days.length;
  const workingDays = days.filter((d) =>
    isWorkingDay(d, settings, holidayMap, employee.weeklyOffDays)
  ).length;

  const salary = employee.salary || {};
  const monthlyGross = Number(salary.monthlyGross) || 0;

  const { lopDays, unpaidLeaveDays, absentDays } = await calculateLopDays(
    employee,
    monthStart,
    monthEnd,
    settings,
    holidayMap,
    { skipAbsences: !!employee.attendanceExempt }
  );

  const dayRate = perDaySalary(monthlyGross, { calendarDays, workingDays }, settings);
  // Payslips are shown in whole rupees; per-day division otherwise leaves paise.
  const lopAmount = Math.min(monthlyGross, Math.round(dayRate * lopDays));

  // Monthly pay is CTC / 12 and sits on a single line; loss of pay is the only
  // thing that reduces it.
  const basicSalary = Number(salary.basic) || monthlyGross;
  const hra = Number(salary.hra) || 0;
  const allowances = Number(salary.specialAllowance) || 0;
  const pf = Number(salary.pf) || 0;
  const professionalTax = Number(salary.professionalTax) || 0;
  const other = Number(salary.otherDeductions) || 0;

  const grossSalary = round(basicSalary + hra + allowances);
  const totalDeductions = round(pf + professionalTax + other + lopAmount);

  return {
    userId: employee._id,
    employeeName: employee.name,
    employeeId: employee.employeeId,
    department: employee.department,
    month,
    year,
    basicSalary,
    hra,
    allowances,
    deductions: {
      tax: professionalTax,
      pf,
      unpaidLeaveDeduction: lopAmount,
      other,
      advance: 0,
    },
    grossSalary,
    netSalary: round(Math.max(0, grossSalary - totalDeductions)),
    // Attendance-exempt: HR types the final amount in the payroll run. The
    // figures above (fixed salary less unpaid leave) are only the suggestion.
    manualPay: !!employee.attendanceExempt,
    lop: {
      lopDays,
      unpaidLeaveDays,
      absentDays,
      dayRate,
      lopAmount,
      basis: settings.salaryStructure?.lopBasis || 'calendarDays',
      calendarDays,
      workingDays,
    },
  };
};

// @desc    Preview or run payroll for a month across the organisation
// @route   POST /api/payroll/run
// @access  Private (Admin only)
const runPayroll = async (req, res) => {
  try {
    const { month, year, dryRun = true, paymentStatus = 'Pending', amounts = {} } = req.body;

    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);

    if (!targetMonth || !targetYear || targetMonth < 1 || targetMonth > 12) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid month (1-12) and year.',
      });
    }

    const settings = await OrgSettings.getSettings();
    const employees = await User.find({ status: 'Active' }).sort({ name: 1 });

    const existing = await Salary.find({ month: targetMonth, year: targetYear });
    const alreadyPaid = new Set(existing.map((s) => s.userId.toString()));

    const pendingAdvances = await getPendingAdvancesByUser(employees.map((e) => e._id));

    const toProcess = [];
    const skipped = [];

    for (const employee of employees) {
      if (alreadyPaid.has(employee._id.toString())) {
        skipped.push({
          employeeName: employee.name,
          employeeId: employee.employeeId,
          reason: 'Payslip already exists for this month',
        });
        continue;
      }

      // Without a salary structure there is nothing to pay from, and guessing
      // a number is worse than reporting the gap. Exempt employees are the
      // exception: HR types their amount, so a structure is only a suggestion.
      if (!employee.attendanceExempt && (!employee.salary || !employee.salary.monthlyGross)) {
        skipped.push({
          employeeName: employee.name,
          employeeId: employee.employeeId,
          reason: 'No salary structure set — add their CTC first',
        });
        continue;
      }

      const payslip = await buildPayslipForEmployee(employee, targetMonth, targetYear, settings);

      if (payslip.manualPay) {
        const entered = Number(amounts?.[employee._id.toString()]);
        const hasAmount = Number.isFinite(entered) && entered > 0;

        // The preview lists them with the suggested figure so HR can fill it
        // in; only the real run needs an amount, and one left blank waits for
        // a later run instead of holding up everyone else's pay.
        if (!hasAmount) {
          if (!dryRun) {
            skipped.push({
              employeeName: employee.name,
              employeeId: employee.employeeId,
              reason: 'Attendance not tracked — no amount entered by HR',
            });
            continue;
          }
        } else if (round(entered) !== payslip.netSalary) {
          // HR's figure is final, so it replaces the structure on a single line.
          Object.assign(payslip, {
            basicSalary: round(entered),
            hra: 0,
            allowances: 0,
            deductions: { tax: 0, pf: 0, unpaidLeaveDeduction: 0, other: 0, advance: 0 },
            grossSalary: round(entered),
            netSalary: round(entered),
            lop: { ...payslip.lop, lopAmount: 0 },
          });
        }
      }

      // Salary already paid in advance comes off this payslip, so it is not
      // paid a second time. Anything larger than this month's pay carries over.
      const advances = pendingAdvances[employee._id.toString()] || [];
      // HR types manual pay before the advance comes off, so the preview hands
      // back that figure for the amount box.
      payslip.netBeforeAdvance = payslip.netSalary;
      if (advances.length > 0) {
        const recovery = planAdvanceRecovery(advances, payslip.netSalary);
        payslip.deductions.advance = recovery.total;
        payslip.netSalary = round(Math.max(0, payslip.netSalary - recovery.total));
        payslip.advanceRecovery = recovery;
      }

      toProcess.push(payslip);
    }

    const totals = toProcess.reduce(
      (acc, p) => ({
        gross: round(acc.gross + p.grossSalary),
        net: round(acc.net + p.netSalary),
        lop: round(acc.lop + p.lop.lopAmount),
        advance: round(acc.advance + (p.deductions.advance || 0)),
      }),
      { gross: 0, net: 0, lop: 0, advance: 0 }
    );

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        message: `Preview: ${toProcess.length} payslip(s) ready, ${skipped.length} skipped.`,
        payslips: toProcess,
        skipped,
        totals,
      });
    }

    // Commit: create the payslips.
    const created = [];
    for (const payslip of toProcess) {
      const record = new Salary({
        userId: payslip.userId,
        month: payslip.month,
        year: payslip.year,
        basicSalary: payslip.basicSalary,
        hra: payslip.hra,
        allowances: payslip.allowances,
        deductions: payslip.deductions,
        grossSalary: payslip.grossSalary,
        netSalary: payslip.netSalary,
        paymentStatus,
        paymentDate: new Date(),
        remarks: [
          payslip.manualPay
            ? 'Salary entered by HR (attendance not tracked)'
            : payslip.lop.lopDays > 0
              ? `Monthly payroll · ${payslip.lop.lopDays} LOP day(s) deducted`
              : 'Monthly payroll run',
          payslip.deductions.advance > 0
            ? `Advance salary recovered: ₹${payslip.deductions.advance.toLocaleString('en-IN')} (${payslip.advanceRecovery.allocations.map((a) => a.reason).join('; ')})`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
      await record.save();
      if (payslip.advanceRecovery?.allocations.length) {
        await recordAdvanceRecovery(payslip.advanceRecovery.allocations, record);
      }
      created.push(record);
      // No employee notification: payslips are shared with employees on request.
    }

    res.status(201).json({
      success: true,
      dryRun: false,
      message: `Payroll run complete: ${created.length} payslip(s) generated, ${skipped.length} skipped.`,
      created: created.length,
      skipped,
      totals,
    });
  } catch (error) {
    console.error('Payroll Run Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run payroll',
      error: error.message,
    });
  }
};

module.exports = { runPayroll, buildPayslipForEmployee, calculateLopDays };
