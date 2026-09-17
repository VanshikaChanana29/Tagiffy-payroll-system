const PDFDocument = require('pdfkit');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Indian digit grouping: 1234567 -> 12,34,567 */
const inr = (value) => {
  const n = Math.round(Number(value) || 0);
  return n.toLocaleString('en-IN');
};

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigits = (n) => {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  return TENS[tens] + (rest ? ` ${ONES[rest]}` : '');
};

/**
 * Amount in words, Indian style — payslips are expected to carry it, and it is
 * the line people check when a figure looks wrong.
 */
const amountInWords = (value) => {
  let n = Math.round(Number(value) || 0);
  if (n === 0) return 'Zero Rupees Only';

  const parts = [];
  const units = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
    [100, 'Hundred'],
  ];

  for (const [divisor, name] of units) {
    const count = Math.floor(n / divisor);
    if (count > 0) {
      parts.push(`${twoDigits(count)} ${name}`);
      n %= divisor;
    }
  }
  if (n > 0) parts.push(twoDigits(n));

  return `${parts.join(' ')} Rupees Only`;
};

/**
 * Streams a payslip PDF for one salary record.
 *
 * Laid out as a conventional Indian payslip: earnings on the left, deductions
 * on the right, net pay and amount in words below.
 */
// pdfOptions is an escape hatch for inspection (e.g. compress: false); the API
// never passes it.
const buildPayslipPdf = (res, { salary, employee, companyName }, pdfOptions = {}) => {
  const doc = new PDFDocument({ size: 'A4', margin: 40, ...pdfOptions });
  doc.pipe(res);

  const LEFT = 40;
  const RIGHT = 555;
  const MID = 300;
  const ink = '#0f172a';
  const muted = '#64748b';
  const line = '#cbd5e1';

  // --- Header ---
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(companyName || 'Taggify', LEFT, 45);
  doc.font('Helvetica').fontSize(9).fillColor(muted)
    .text('Payslip — confidential', LEFT, 70);

  doc.font('Helvetica-Bold').fontSize(12).fillColor(ink)
    .text(`${MONTHS[salary.month - 1]} ${salary.year}`, LEFT, 45, { width: RIGHT - LEFT, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(muted)
    .text(
      salary.paymentStatus === 'Paid'
        ? `Paid on ${new Date(salary.paymentDate).toLocaleDateString('en-IN')}`
        : 'Payment pending',
      LEFT, 62, { width: RIGHT - LEFT, align: 'right' }
    );

  doc.moveTo(LEFT, 92).lineTo(RIGHT, 92).strokeColor(line).lineWidth(1).stroke();

  // --- Employee details ---
  let y = 106;
  const detail = (label, value, x) => {
    doc.font('Helvetica').fontSize(8).fillColor(muted).text(label.toUpperCase(), x, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text(value || '—', x, y + 11);
  };

  detail('Employee', employee.name, LEFT);
  detail('Employee ID', employee.employeeId, MID);
  y += 32;
  detail('Designation', employee.designation, LEFT);
  detail('Department', employee.department, MID);
  y += 32;
  detail(
    'Date of joining',
    employee.joiningDate ? new Date(employee.joiningDate).toLocaleDateString('en-IN') : '—',
    LEFT
  );
  detail('Pay period', `${MONTHS[salary.month - 1]} ${salary.year}`, MID);

  y += 42;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(line).stroke();
  y += 14;

  // --- Earnings and deductions, side by side ---
  const colHeader = (text, x) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text(text.toUpperCase(), x, y);
  };
  colHeader('Earnings', LEFT);
  colHeader('Deductions', MID);
  y += 16;

  const rows = (items, x, startY) => {
    let rowY = startY;
    items.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(muted).text(label, x, rowY);
      doc.font('Helvetica').fontSize(9.5).fillColor(ink)
        .text(`INR ${inr(value)}`, x, rowY, { width: 215, align: 'right' });
      rowY += 17;
    });
    return rowY;
  };

  const d = salary.deductions || {};

  // Pay is simply CTC / 12, so there is one earnings line. Older payslips that
  // still carry a component split keep showing it.
  const hasSplit = (Number(salary.hra) || 0) > 0 || (Number(salary.allowances) || 0) > 0;
  const earnings = hasSplit
    ? [
        ['Basic Salary', salary.basicSalary],
        ['House Rent Allowance', salary.hra],
        ['Special Allowance', salary.allowances],
      ]
    : [['Monthly Salary (CTC / 12)', salary.basicSalary]];

  // Only real, explainable reductions appear. A zero line is noise.
  const deductions = [
    ['Loss of Pay', d.unpaidLeaveDeduction],
    ['Other Deductions', d.other],
    ['Provident Fund', d.pf],
    ['Professional Tax', d.tax],
  ].filter(([, value], index) => index === 0 || (Number(value) || 0) > 0);

  const earningsEnd = rows(earnings, LEFT, y);
  const deductionsEnd = rows(deductions, MID, y);
  let totalsY = Math.max(earningsEnd, deductionsEnd) + 6;

  doc.moveTo(LEFT, totalsY).lineTo(LEFT + 215, totalsY).strokeColor(line).stroke();
  doc.moveTo(MID, totalsY).lineTo(MID + 215, totalsY).strokeColor(line).stroke();
  totalsY += 8;

  const totalDeductions =
    (Number(d.pf) || 0) + (Number(d.tax) || 0) +
    (Number(d.unpaidLeaveDeduction) || 0) + (Number(d.other) || 0);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(ink).text('Gross Earnings', LEFT, totalsY);
  doc.font('Helvetica-Bold').fontSize(10)
    .text(`INR ${inr(salary.grossSalary)}`, LEFT, totalsY, { width: 215, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(10).text('Total Deductions', MID, totalsY);
  doc.font('Helvetica-Bold').fontSize(10)
    .text(`INR ${inr(totalDeductions)}`, MID, totalsY, { width: 215, align: 'right' });

  // --- Net pay ---
  const netY = totalsY + 30;
  doc.roundedRect(LEFT, netY, RIGHT - LEFT, 54, 6).fillAndStroke('#f1f5f9', line);
  doc.fillColor(muted).font('Helvetica').fontSize(8).text('NET PAY', LEFT + 14, netY + 12);
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(18)
    .text(`INR ${inr(salary.netSalary)}`, LEFT + 14, netY + 24);
  doc.fillColor(muted).font('Helvetica').fontSize(8)
    .text(amountInWords(salary.netSalary), LEFT + 14, netY + 24, {
      width: RIGHT - LEFT - 28,
      align: 'right',
    });

  // --- Footer ---
  const footY = netY + 76;
  if (salary.remarks) {
    doc.font('Helvetica').fontSize(8).fillColor(muted)
      .text(`Remarks: ${salary.remarks}`, LEFT, footY, { width: RIGHT - LEFT });
  }
  doc.font('Helvetica').fontSize(7.5).fillColor(muted)
    .text(
      'This is a computer-generated payslip and does not require a signature.',
      LEFT, footY + 20, { width: RIGHT - LEFT, align: 'center' }
    );

  doc.end();
};

module.exports = { buildPayslipPdf, amountInWords, inr };
