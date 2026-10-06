/**
 * Earned leave: each department gets a fixed number of days credited at the
 * start of every month, and whatever is unused lapses at month end.
 *
 * Nothing is stored as a running balance. A month's balance is always
 *   credit for that month − earned leave days (pending + approved) in that month
 * so a new month simply starts from the full credit again, approving can never
 * double-deduct, and changing a department's rate takes effect immediately.
 */
const { format, parseISO, startOfMonth, endOfMonth, addMonths } = require('date-fns');
const Leave = require('../models/Leave');
const Department = require('../models/Department');
const OrgSettings = require('../models/OrgSettings');
const { countWorkingDays } = require('./attendanceRules');

const DEFAULT_EARNED_PER_MONTH = 1;

// Someone who joins after the 15th starts earning from the following month.
const JOINING_CUTOFF_DAY = 15;

const monthKey = (date) => format(date, 'yyyy-MM');
const currentMonthKey = () => monthKey(new Date());
const monthLabel = (month) => format(parseISO(`${month}-01`), 'MMM yyyy');

/** Rates for every department, loaded once per request. */
const loadPolicyContext = async (settings = null) => {
  const [orgSettings, departments] = await Promise.all([
    settings || OrgSettings.getSettings(),
    Department.find().select('name leavePolicy'),
  ]);

  const defaultRate = orgSettings.leavePolicy?.earnedPerMonth ?? DEFAULT_EARNED_PER_MONTH;
  const deptRates = new Map();
  departments.forEach((d) => {
    if (d.leavePolicy?.earnedPerMonth !== null && d.leavePolicy?.earnedPerMonth !== undefined) {
      deptRates.set(d.name, d.leavePolicy.earnedPerMonth);
    }
  });

  return { defaultRate, deptRates };
};

const earnedPerMonthFor = (department, ctx) =>
  ctx.deptRates.has(department) ? ctx.deptRates.get(department) : ctx.defaultRate;

/** What one employee is credited for one month, honouring their joining date. */
const creditForMonth = (user, month, ctx) => {
  const rate = earnedPerMonthFor(user.department, ctx);
  if (!user.joiningDate) return rate;

  const joining = new Date(user.joiningDate);
  const joiningMonth = monthKey(joining);
  if (month < joiningMonth) return 0;
  if (month === joiningMonth && joining.getDate() > JOINING_CUTOFF_DAY) return 0;
  return rate;
};

/** Splits a leave range into working days per month, e.g. a request over a month end. */
const splitWorkingDaysByMonth = (startDate, endDate, settings, holidayMap, weeklyOffDays) => {
  const result = [];
  let cursor = startOfMonth(parseISO(startDate));
  const last = parseISO(endDate);

  while (cursor <= last) {
    const segStart = format(cursor, 'yyyy-MM-dd') < startDate ? startDate : format(cursor, 'yyyy-MM-dd');
    const monthEndStr = format(endOfMonth(cursor), 'yyyy-MM-dd');
    const segEnd = monthEndStr > endDate ? endDate : monthEndStr;

    const { workingDays } = countWorkingDays(segStart, segEnd, settings, holidayMap, weeklyOffDays);
    if (workingDays > 0) result.push({ month: monthKey(cursor), days: workingDays });

    cursor = addMonths(cursor, 1);
  }
  return result;
};

// Leaves saved before monthlyDays existed are charged to their start month.
const leaveDaysByMonth = (leave) =>
  leave.monthlyDays?.length
    ? leave.monthlyDays
    : [{ month: leave.startDate.slice(0, 7), days: leave.daysCount }];

/**
 * Earned leave already taken per user per month, as
 * Map(userId -> Map(month -> { approved, pending })).
 */
const getEarnedUsage = async (userIds, months, excludeLeaveId = null) => {
  const sorted = [...months].sort();
  const query = {
    userId: { $in: userIds },
    leaveType: 'Paid',
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $lte: format(endOfMonth(parseISO(`${sorted[sorted.length - 1]}-01`)), 'yyyy-MM-dd') },
    endDate: { $gte: `${sorted[0]}-01` },
  };
  if (excludeLeaveId) query._id = { $ne: excludeLeaveId };

  const leaves = await Leave.find(query).select('userId startDate daysCount monthlyDays status');

  const usage = new Map();
  leaves.forEach((leave) => {
    const uid = leave.userId.toString();
    if (!usage.has(uid)) usage.set(uid, new Map());
    const byMonth = usage.get(uid);

    // Days beyond the credit are loss of pay, not earned leave, so they don't
    // use up the balance.
    leaveDaysByMonth(leave).forEach(({ month, days, unpaidDays = 0 }) => {
      if (!months.includes(month)) return;
      const covered = Math.max(0, days - unpaidDays);
      const entry = byMonth.get(month) || { approved: 0, pending: 0 };
      if (leave.status === 'Approved') entry.approved += covered;
      else entry.pending += covered;
      byMonth.set(month, entry);
    });
  });
  return usage;
};

/**
 * The balance object the app shows. `paid` is what is still available this
 * month; it keeps that name so existing screens read it unchanged.
 */
const buildBalance = (user, month, usage, ctx) => {
  const credit = creditForMonth(user, month, ctx);
  const entry = usage.get(user._id.toString())?.get(month) || { approved: 0, pending: 0 };
  return {
    month,
    earnedPerMonth: earnedPerMonthFor(user.department, ctx),
    credit,
    used: entry.approved,
    pending: entry.pending,
    paid: Math.max(0, credit - entry.approved - entry.pending),
    sick: 0,
    unpaid: 0,
  };
};

/** This month's earned leave balance for one user. */
const getLeaveBalance = async (user, ctx = null) => {
  const policy = ctx || (await loadPolicyContext());
  const month = currentMonthKey();
  const usage = await getEarnedUsage([user._id], [month]);
  return buildBalance(user, month, usage, policy);
};

/**
 * Returns plain copies of the given users with `leaveBalance` replaced by this
 * month's computed balance. Users need department, joiningDate and _id.
 */
const withLeaveBalances = async (users) => {
  if (!users.length) return [];
  const ctx = await loadPolicyContext();
  const month = currentMonthKey();
  const usage = await getEarnedUsage(users.map((u) => u._id), [month]);

  return users.map((u) => {
    const obj = typeof u.toJSON === 'function' ? u.toJSON() : { ...u };
    obj.leaveBalance = buildBalance(u, month, usage, ctx);
    return obj;
  });
};

/**
 * Splits an Earned leave request against each month's remaining credit. Days
 * the credit doesn't cover are not refused: they become unpaid (loss of pay).
 * Returns { monthlyDays, unpaidDays, note } where each month carries its own
 * unpaidDays and `note` explains the excess (null when fully covered). Pass
 * excludeLeaveId when re-allocating a request that is already counted.
 */
const allocateEarned = async (user, monthlyDays, { excludeLeaveId = null, ctx = null } = {}) => {
  const policy = ctx || (await loadPolicyContext());
  const months = monthlyDays.map((m) => m.month);
  const usage = await getEarnedUsage([user._id], months, excludeLeaveId);

  const notes = [];
  const allocated = monthlyDays.map(({ month, days }) => {
    const { paid: available } = buildBalance(user, month, usage, policy);
    const unpaidDays = Math.max(0, days - available);
    if (unpaidDays > 0) {
      notes.push(`${unpaidDays} of ${days} day(s) in ${monthLabel(month)}`);
    }
    return { month, days, unpaidDays };
  });

  const unpaidDays = allocated.reduce((sum, m) => sum + m.unpaidDays, 0);
  return {
    monthlyDays: allocated,
    unpaidDays,
    note: notes.length
      ? `Earned leave balance is not enough: ${notes.join(', ')} will be unpaid and deducted from salary.`
      : null,
  };
};

/**
 * Validates an admin-entered monthly credit: 0-31 days in half-day steps.
 * With allowNull (departments), an empty value means "use the company default".
 * Returns { value } or { error }.
 */
const parseEarnedPerMonth = (raw, { allowNull = false } = {}) => {
  if (raw === null || raw === undefined || raw === '') {
    return allowNull ? { value: null } : { error: 'Earned leave per month is required.' };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 31 || !Number.isInteger(value * 2)) {
    return { error: 'Earned leave per month must be between 0 and 31, in steps of 0.5.' };
  }
  return { value };
};

module.exports = {
  DEFAULT_EARNED_PER_MONTH,
  parseEarnedPerMonth,
  loadPolicyContext,
  earnedPerMonthFor,
  splitWorkingDaysByMonth,
  getLeaveBalance,
  withLeaveBalances,
  allocateEarned,
};
