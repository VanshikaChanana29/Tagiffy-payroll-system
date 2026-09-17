const XLSX = require('xlsx');

// HR can type a column heading in whatever casing/spacing they like — match
// on a normalized form instead of forcing an exact header string.
const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const COLUMN_ALIASES = {
  name: ['name', 'fullname', 'employeename'],
  email: ['email', 'workemail', 'emailaddress'],
  department: ['department', 'dept'],
  designation: ['designation', 'title', 'jobtitle'],
  role: ['role'],
  phone: ['phone', 'phonenumber', 'mobile', 'contactnumber'],
  joiningDate: ['joiningdate', 'dateofjoining', 'doj'],
  annualCtc: ['annualctc', 'ctc', 'annualsalary', 'salary'],
  reportingManagerEmail: ['reportingmanageremail', 'manageremail', 'reportingmanager'],
  password: ['password'],
  employeeId: ['employeeid', 'empid', 'id'],
};

const ALIAS_TO_FIELD = Object.entries(COLUMN_ALIASES).reduce((map, [field, aliases]) => {
  aliases.forEach((alias) => {
    map[normalizeHeader(alias)] = field;
  });
  return map;
}, {});

const TEMPLATE_HEADERS = [
  'Name',
  'Email',
  'Department',
  'Designation',
  'Role',
  'Phone',
  'Joining Date',
  'Annual CTC',
  'Reporting Manager Email',
  'Password',
];

const TEMPLATE_SAMPLE_ROW = [
  'Ramesh Patel',
  'ramesh.patel@example.com',
  'Engineering',
  'Software Engineer',
  'employee',
  '+91 98765 43210',
  '2026-01-15',
  '1200000',
  '',
  '',
];

// Parses an uploaded workbook buffer into row objects keyed by our own field
// names, regardless of the exact header text/casing HR used. Returns each row
// alongside its original spreadsheet row number, so errors can point back to
// the exact line HR needs to fix.
const parseEmployeeSheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], unrecognizedHeaders: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  // header: 1 gives raw arrays so we control header-matching ourselves instead
  // of trusting sheet_to_json's exact-key behavior.
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (raw.length === 0) {
    return { rows: [], unrecognizedHeaders: [] };
  }

  const [headerRow, ...dataRows] = raw;
  const fieldByColumn = headerRow.map((h) => ALIAS_TO_FIELD[normalizeHeader(h)] || null);
  const unrecognizedHeaders = headerRow.filter((h, i) => h && !fieldByColumn[i]);

  const rows = dataRows.map((cells, idx) => {
    const record = {};
    fieldByColumn.forEach((field, colIdx) => {
      if (!field) return;
      const value = cells[colIdx];
      record[field] = typeof value === 'string' ? value.trim() : value;
    });
    return {
      // +2: 1 for the header row, 1 to convert 0-index to a human row number.
      rowNumber: idx + 2,
      data: record,
    };
  });

  return { rows, unrecognizedHeaders };
};

// Builds the downloadable .xlsx template HR fills in, with a sample row
// showing the expected shape of each column.
const buildEmployeeTemplateWorkbook = () => {
  const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW]);
  worksheet['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  parseEmployeeSheet,
  buildEmployeeTemplateWorkbook,
  TEMPLATE_HEADERS,
};
