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

module.exports = { buildSalaryBreakup, perDaySalary, round };
