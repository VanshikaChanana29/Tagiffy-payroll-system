const XLSX = require('xlsx');

// Same forgiving header matching as the bulk employee sheet.
const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/[\s_.()₹-]+/g, '');

const COLUMN_ALIASES = {
  email: ['email', 'workemail', 'emailaddress', 'emailid', 'mailid'],
  amount: ['incentive', 'incentiveamount', 'incentive(₹)', 'amount', 'bonus', 'bonusamount'],
  remarks: ['remarks', 'remark', 'note', 'notes', 'reason'],
  name: ['name', 'employeename', 'fullname'],
};

const ALIAS_TO_FIELD = Object.entries(COLUMN_ALIASES).reduce((map, [field, aliases]) => {
  aliases.forEach((alias) => {
    map[normalizeHeader(alias)] = field;
  });
  return map;
}, {});

const TEMPLATE_HEADERS = ['Name', 'Email', 'Incentive Amount', 'Remarks'];

// Returns each data row keyed by our field names, with its spreadsheet row
// number so errors can point HR at the exact line.
const parseIncentiveSheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], missingColumns: ['Email', 'Incentive Amount'] };

  const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (raw.length === 0) return { rows: [], missingColumns: [] };

  const [headerRow, ...dataRows] = raw;
  const fieldByColumn = headerRow.map((h) => ALIAS_TO_FIELD[normalizeHeader(h)] || null);
  const missingColumns = [];
  if (!fieldByColumn.includes('email')) missingColumns.push('Email');
  if (!fieldByColumn.includes('amount')) missingColumns.push('Incentive Amount');

  const rows = dataRows.map((cells, idx) => {
    const record = {};
    fieldByColumn.forEach((field, colIdx) => {
      if (!field) return;
      const value = cells[colIdx];
      record[field] = typeof value === 'string' ? value.trim() : value;
    });
    return { rowNumber: idx + 2, data: record };
  });

  return { rows, missingColumns };
};

// Amounts arrive as numbers or as text like "₹5,000". Returns null for a
// blank cell and NaN for anything that is not a number.
const parseAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '') return null;
  return Number(cleaned);
};

// The template lists every active employee so HR only types amounts; rows
// left blank are ignored on upload.
const buildIncentiveTemplateWorkbook = (employees) => {
  const rows = employees.map((e) => [e.name, e.email, '', '']);
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
  worksheet['!cols'] = [{ wch: 26 }, { wch: 32 }, { wch: 18 }, { wch: 30 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Incentives');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  parseIncentiveSheet,
  parseAmount,
  buildIncentiveTemplateWorkbook,
};
