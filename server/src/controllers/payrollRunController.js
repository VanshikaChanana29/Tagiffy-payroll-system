const { format, startOfMonth, endOfMonth, eachDayOfInterval } = require('date-fns');
const User = require('../models/User');
const Salary = require('../models/Salary');
const Leave = require('../models/Leave');
const Attendance = require('../models/Attendance');
const OrgSettings = require('../models/OrgSettings');
const { isWorkingDay } = require('../utils/attendanceRules');
const { getHolidayMap } = require('./holidayController');
const { perDaySalary, round } = require('../utils/salaryStructure');
const { notify } = require('../utils/notificationService');

/**
 * Loss-of-pay days for one employee in one month.
 *
 * Unpaid leave is counted only on working days, and only once — a day that is
 * both marked absent and covered by unpaid leave must not be charged twice.
 */
const calculateLopDays = async (employee, monthStart, monthEnd, settings, holidayMap = {}) => {
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
      if (dateStr >= fromStr && dateStr <= toStr && isWorkingDay(cursor, settings, holidayMap)) {
        lopDates.add(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const unpaidLeaveDays = lopDates.size;
  let absentDays = 0;

  // 2. Absent working days, if the organisation charges for them.
  if (settings.salaryStructure?.countAbsentAsLop) {
    const paidLeaveDates = new Set();
    const paidLeaves = await Leave.find({
      userId: employee._id,
      status: 'Approved',
      leaveType: { $in: ['Paid', 'Sick'] },
      startDate: { $lte: toStr },
      endDate: { $gte: fromStr },
    });
    paidLeaves.forEach((leave) => {
      const cursor = new Date(`${leave.startDate}T00:00:00`);
      const end = new Date(`${leave.endDate}T00:00:00`);
      while (cursor <= end) {
        paidLeaveDates.add(format(cursor, 'yyyy-MM-dd'));
        cursor.setDate(cursor.getDate() + 1);
      }
    });

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
      if (!isWorkingDay(day, settings, holidayMap)) return;
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
  const workingDays = days.filter((d) => isWorkingDay(d, settings, holidayMap)).length;

  const salary = employee.salary || {};
  const monthlyGross = Number(salary.monthlyGross) || 0;

  const { lopDays, unpaidLeaveDays, absentDays } = await calculateLopDays(
    employee,
    monthStart,
    monthEnd,
    settings,
    holidayMap
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
    },
    grossSalary,
    netSalary: round(Math.max(0, grossSalary - totalDeductions)),
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
    const { month, year, dryRun = true, paymentStatus = 'Pending' } = req.body;

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
      // a number is worse than reporting the gap.
      if (!employee.salary || !employee.salary.monthlyGross) {
        skipped.push({
          employeeName: employee.name,
          employeeId: employee.employeeId,
          reason: 'No salary structure set — add their CTC first',
        });
        continue;
      }

      toProcess.push(await buildPayslipForEmployee(employee, targetMonth, targetYear, settings));
    }

    const totals = toProcess.reduce(
      (acc, p) => ({
        gross: round(acc.gross + p.grossSalary),
        net: round(acc.net + p.netSalary),
        lop: round(acc.lop + p.lop.lopAmount),
      }),
      { gross: 0, net: 0, lop: 0 }
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
        remarks:
          payslip.lop.lopDays > 0
            ? `Monthly payroll · ${payslip.lop.lopDays} LOP day(s) deducted`
            : 'Monthly payroll run',
      });
      await record.save();
      created.push(record);

      notify({
        recipients: [payslip.userId],
        type: 'payslip_generated',
        title: 'Payslip generated',
        message: `Your payslip for ${payslip.month}/${payslip.year} is ready. Net pay: ₹${payslip.netSalary}.`,
        relatedEntity: { kind: 'Salary', id: record._id },
      });
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
