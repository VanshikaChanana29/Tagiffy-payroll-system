/**
 * Shared attendance maths: turns raw punches into late marks, overtime, and a
 * day status, using the organisation's configured shift.
 */

// "09:30" -> minutes since midnight
const parseTimeToMinutes = (hhmm, fallback = 0) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
};

const minutesSinceMidnight = (date) => date.getHours() * 60 + date.getMinutes();

const hasCustomShift = (employee) =>
  !!(employee?.customShift?.shiftStart && employee?.customShift?.shiftEnd);

/**
 * The rules that apply to one employee: the org settings, with their personal
 * office timing laid over the shift window when HR has set one. Everything
 * else (full-day hours, overtime) stays org-wide. Pass the result anywhere a
 * `settings` object is expected.
 */
const resolveEmployeeShift = (settings, employee) => {
  const base = typeof settings?.toObject === 'function' ? settings.toObject() : { ...settings };
  if (!hasCustomShift(employee)) return { ...base, isCustomShift: false };

  const { shiftStart, shiftEnd, graceMinutes } = employee.customShift;
  return {
    ...base,
    shiftStart,
    shiftEnd,
    graceMinutes: graceMinutes ?? base.graceMinutes,
    isCustomShift: true,
  };
};

/** Minutes late, counting the grace period. 0 when on time. */
const calculateLateMinutes = (checkIn, settings) => {
  if (!checkIn) return 0;
  const shiftStart = parseTimeToMinutes(settings.shiftStart, 570);
  const allowedStart = shiftStart + (settings.graceMinutes || 0);
  return Math.max(0, minutesSinceMidnight(new Date(checkIn)) - allowedStart);
};

/**
 * Minutes left before the shift ended. 0 when they stayed to the end or left
 * within the grace period, which forgives leaving early the same way it
 * forgives arriving late.
 */
const calculateEarlyMinutes = (checkOut, settings) => {
  if (!checkOut) return 0;
  const shiftEnd = parseTimeToMinutes(settings.shiftEnd, 1110);
  const earlyMinutes = Math.max(0, shiftEnd - minutesSinceMidnight(new Date(checkOut)));
  return earlyMinutes > (settings.graceMinutes || 0) ? earlyMinutes : 0;
};

/** Hours worked beyond the overtime threshold, rounded to 2 decimals. */
const calculateOvertimeHours = (totalHours, settings) => {
  const threshold = Number(settings.overtimeAfterHours) || 9;
  return Math.max(0, Number((totalHours - threshold).toFixed(2)));
};

/**
 * Present / Half-day / Absent from hours worked. Falling short of a full day
 * by no more than the grace period still counts as Present, so someone who
 * only used up their grace is not marked Half-day.
 */
const resolveStatus = (totalHours, settings) => {
  const fullDayMinutes = (Number(settings.fullDayHours) || 8) * 60;
  const halfDayMinutes = (Number(settings.halfDayHours) || 4) * 60;
  const graceMinutes = Number(settings.graceMinutes) || 0;
  // Compare whole minutes: totalHours is rounded to 2 decimals.
  const workedMinutes = Math.round((Number(totalHours) || 0) * 60);

  if (workedMinutes >= Math.max(halfDayMinutes, fullDayMinutes - graceMinutes)) return 'Present';
  if (workedMinutes >= halfDayMinutes) return 'Half-day';
  return 'Absent';
};

// weeklyOffDays lets one employee's weekend differ from the org default, e.g.
// a 6-day-week role that is only off on Sunday while everyone else is off
// Saturday+Sunday too. Pass the employee's own User.weeklyOffDays; leave it
// unset (or empty) to fall back to the organisation-wide settings.workingDays.
const isWorkingDay = (date, settings, holidayMap = null, weeklyOffDays = null) => {
  const dayOfWeek = date.getDay();

  if (Array.isArray(weeklyOffDays) && weeklyOffDays.length > 0) {
    if (weeklyOffDays.includes(dayOfWeek)) return false;
  } else {
    const days = settings.workingDays?.length ? settings.workingDays : [1, 2, 3, 4, 5];
    if (!days.includes(dayOfWeek)) return false;
  }

  // A company holiday is not a working day either.
  if (holidayMap) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
    if (holidayMap[key]) return false;
  }
  return true;
};

/**
 * Hours worked across all of the day's closed punch sessions, rounded to 2
 * decimals. The time between punching out and punching back in is not counted.
 */
const sumSessionHours = (attendance) => {
  const sessions = attendance.sessions?.length
    ? attendance.sessions
    : [{ checkIn: attendance.checkIn, checkOut: attendance.checkOut }];
  const workedMs = sessions.reduce((acc, session) => {
    if (!session.checkIn || !session.checkOut) return acc;
    return acc + Math.max(0, new Date(session.checkOut) - new Date(session.checkIn));
  }, 0);
  return parseFloat((workedMs / (1000 * 60 * 60)).toFixed(2));
};

/** Recomputes every derived field on a record after its punches change. */
const applyAttendanceRules = (attendance, settings) => {
  const totalHours = Number(attendance.totalHours) || 0;

  attendance.lateMinutes = calculateLateMinutes(attendance.checkIn, settings);
  attendance.isLate = attendance.lateMinutes > 0;
  attendance.earlyExitMinutes = attendance.checkOut
    ? calculateEarlyMinutes(attendance.checkOut, settings)
    : 0;
  attendance.overtimeHours = attendance.checkOut
    ? calculateOvertimeHours(totalHours, settings)
    : 0;

  // Leave and manual admin overrides keep their status; only worked days derive it.
  if (attendance.checkOut && attendance.status !== 'Leave') {
    attendance.status = resolveStatus(totalHours, settings);
  }

  return attendance;
};

/**
 * Counts working days in an inclusive YYYY-MM-DD range, skipping the days the
 * organisation does not work. Leave is charged in working days: booking
 * Friday to Monday should cost 2 days, not 4.
 */
const countWorkingDays = (startDateStr, endDateStr, settings, holidayMap = null, weeklyOffDays = null) => {
  const cursor = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);

  let workingDays = 0;
  let calendarDays = 0;

  while (cursor <= end) {
    calendarDays += 1;
    if (isWorkingDay(cursor, settings, holidayMap, weeklyOffDays)) workingDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return { workingDays, calendarDays };
};

module.exports = {
  countWorkingDays,
  parseTimeToMinutes,
  hasCustomShift,
  resolveEmployeeShift,
  calculateLateMinutes,
  calculateEarlyMinutes,
  calculateOvertimeHours,
  resolveStatus,
  sumSessionHours,
  isWorkingDay,
  applyAttendanceRules,
};
