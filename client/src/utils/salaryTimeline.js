/**
 * Mirrors server/src/utils/salaryStructure.js: which CTC revision applies to
 * which month. Keep the two in step.
 *
 * Revisions are replayed in the order HR entered them (history, then the
 * current structure). Each applies from its effective month onwards and
 * replaces anything set for that month or later.
 */

// "YYYY-MM", read in UTC to match how effective months are stored.
export const monthKey = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

// "YYYY-MM" for a local date, e.g. for <input type="month"> defaults.
export const localMonthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const nextMonthKey = (date = new Date()) =>
  localMonthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));

export const monthLabel = (date) =>
  date
    ? new Date(date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '-';

export const salaryTimeline = (salary, salaryHistory = []) => {
  const entries = [...(salaryHistory || []), salary].filter(
    (s) => s && Number(s.annualCtc) > 0
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
 * { current, upcoming }: the revision in effect this month (or null if none
 * has started yet) and the next one scheduled after it (or null).
 */
export const resolveSalary = (salary, salaryHistory = [], now = new Date()) => {
  const thisMonth = localMonthKey(now);
  let current = null;
  let upcoming = null;
  salaryTimeline(salary, salaryHistory).forEach((entry) => {
    if (monthKey(entry.effectiveFrom) <= thisMonth) current = entry;
    else if (!upcoming) upcoming = entry;
  });
  return { current, upcoming };
};
