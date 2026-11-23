/**
 * Salary is deliberately simple: monthly pay is the annual CTC divided by 12.
 *
 * No component split (Basic / HRA / Special Allowance), no PF, no professional
 * tax, no TDS. The only thing that ever reduces a payslip is loss of pay for
 * days not worked.
 */

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

const buildSalaryBreakup = (annualCtc) => {
  const ctc = Math.max(0, Number(annualCtc) || 0);
  const monthlyGross = Math.round(ctc / 12);

  return {
    annualCtc: ctc,
    monthlyGross,
    // Kept at the full monthly figure so the payslip has a single earnings line.
    basic: monthlyGross,
    hra: 0,
    specialAllowance: 0,
    pf: 0,
    professionalTax: 0,
    otherDeductions: 0,
    totalDeductions: 0,
    netMonthly: monthlyGross,
  };
};

/**
 * Per-day pay used for loss of pay, derived from the configured basis.
 */
const perDaySalary = (monthlyGross, { calendarDays, workingDays }, settings) => {
  const basis = settings?.salaryStructure?.lopBasis || 'calendarDays';
  const divisor = basis === 'workingDays' ? workingDays : calendarDays;
  if (!divisor || divisor <= 0) return 0;
  return round(monthlyGross / divisor);
};

/**
 * "YYYY-MM" for a date, read in UTC so it matches how effective months are
 * stored (1st of the month, 00:00 UTC). Empty string for a missing date, which
 * sorts before every month and so means "in effect from the beginning".
 */
const monthKey = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Normalises an effective date to the 1st of its month (00:00 UTC). Accepts
 * "YYYY-MM", "YYYY-MM-DD" or a Date. Returns null when it cannot be read.
 */
const toEffectiveMonth = (value) => {
  if (!value) return null;
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return new Date(Date.UTC(year, month - 1, 1));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/**
 * The employee's salary revisions as a timeline, oldest first.
 *
 * Revisions are replayed in the order HR entered them (archived history, then
 * the current structure). Each one applies from its effective month onwards
 * and replaces whatever was set for that month or later, so a backdated or
 * re-entered revision wins over an older entry for the same months.
 */
const salaryTimeline = (employee) => {
  const entries = [...(employee?.salaryHistory || []), employee?.salary].filter(
    (s) => s && Number(s.monthlyGross) > 0
  );

  let timeline = [];
  entries.forEach((entry) => {
    const key = monthKey(entry.effectiveFrom);
    timeline = timeline.filter((t) => monthKey(t.effectiveFrom) < key);
    timeline.push(entry);
  });
  return timeline;
};

/**
 * The salary structure that applies to a given payroll month, or null when no
 * revision is in effect yet (e.g. the first CTC starts in a later month).
 */
const salaryForMonth = (employee, month, year) => {
  const target = `${year}-${String(month).padStart(2, '0')}`;
  let picked = null;
  salaryTimeline(employee).forEach((entry) => {
    if (monthKey(entry.effectiveFrom) <= target) picked = entry;
  });
  return picked;
};

module.exports = {
  buildSalaryBreakup,
  perDaySalary,
  round,
  monthKey,
  toEffectiveMonth,
  salaryTimeline,
  salaryForMonth,
};
