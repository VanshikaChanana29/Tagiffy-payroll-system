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

/** Minutes late, counting the grace period. 0 when on time. */
const calculateLateMinutes = (checkIn, settings) => {
  if (!checkIn) return 0;
  const shiftStart = parseTimeToMinutes(settings.shiftStart, 570);
  const allowedStart = shiftStart + (settings.graceMinutes || 0);
  return Math.max(0, minutesSinceMidnight(new Date(checkIn)) - allowedStart);
};

/** Minutes left before the shift ended. 0 when they stayed to the end. */
const calculateEarlyMinutes = (checkOut, settings) => {
  if (!checkOut) return 0;
  const shiftEnd = parseTimeToMinutes(settings.shiftEnd, 1110);
  return Math.max(0, shiftEnd - minutesSinceMidnight(new Date(checkOut)));
};

/** Hours worked beyond the overtime threshold, rounded to 2 decimals. */
const calculateOvertimeHours = (totalHours, settings) => {
  const threshold = Number(settings.overtimeAfterHours) || 9;
  return Math.max(0, Number((totalHours - threshold).toFixed(2)));
};

/** Present / Half-day / Absent from hours worked. */
const resolveStatus = (totalHours, settings) => {
  const fullDay = Number(settings.fullDayHours) || 8;
  const halfDay = Number(settings.halfDayHours) || 4;
  if (totalHours >= fullDay) return 'Present';
  if (totalHours >= halfDay) return 'Half-day';
  return 'Absent';
};

const isWorkingDay = (date, settings, holidayMap = null) => {
  const days = settings.workingDays?.length ? settings.workingDays : [1, 2, 3, 4, 5];
  if (!days.includes(date.getDay())) return false;

  // A company holiday is not a working day either.
  if (holidayMap) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
    if (holidayMap[key]) return false;
  }
  return true;
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
const countWorkingDays = (startDateStr, endDateStr, settings, holidayMap = null) => {
  const cursor = new Date(`${startDateStr}T00:00:00`);
  const end = new Date(`${endDateStr}T00:00:00`);

  let workingDays = 0;
  let calendarDays = 0;

  while (cursor <= end) {
    calendarDays += 1;
    if (isWorkingDay(cursor, settings, holidayMap)) workingDays += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return { workingDays, calendarDays };
};

module.exports = {
  countWorkingDays,
  parseTimeToMinutes,
  calculateLateMinutes,
  calculateEarlyMinutes,
  calculateOvertimeHours,
  resolveStatus,
  isWorkingDay,
  applyAttendanceRules,
};
