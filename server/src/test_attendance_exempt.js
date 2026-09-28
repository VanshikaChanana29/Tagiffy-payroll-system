// Attendance-exempt employees: no punch, never absent, HR-entered pay.
//
// Runs payroll for real, which writes payslips for every active employee, so it
// always uses a throwaway in-memory database and never touches server/.env's DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5055';

const mongoose = require('mongoose');
const request = require('http');

async function runAttendanceExemptTest() {
  console.log('🧪 Starting Attendance-Exempt Employee Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Salary = require('./models/Salary');
  // Let the startup seed finish before logging in.
  while ((await User.countDocuments()) === 0) {
    await new Promise((r) => setTimeout(r, 300));
  }

  const makeRequest = (path, method = 'GET', data = null, token = null) => {
    return new Promise((resolve, reject) => {
      const payload = data ? JSON.stringify(data) : '';
      const req = request.request(
        {
          hostname: 'localhost',
          port: process.env.PORT,
          path,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch {
              resolve({ status: res.statusCode, raw: body });
            }
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };

  let failures = 0;
  const check = (label, condition, detail = '') => {
    if (condition) {
      console.log(`  ✅ ${label}`);
    } else {
      failures += 1;
      console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    }
  };

  // The server starts listening only once the startup seed has finished.
  for (;;) {
    try {
      await makeRequest('/api/auth/me');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  try {
    const adminLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'admin@dayflow.com',
      password: 'admin123',
    });
    const adminToken = adminLogin.data.token;
    check('Admin logs in', !!adminToken, JSON.stringify(adminLogin.data));

    const onboard = async (name, extra) => {
      const res = await makeRequest(
        '/api/users',
        'POST',
        {
          name,
          email: `${name.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@dayflow.com`,
          password: 'employee123',
          department: 'Finance',
          designation: 'Financial Controller',
          role: 'employee',
          // Joined at the start of last month so a full month is in play.
          joiningDate: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
          ...extra,
        },
        adminToken
      );
      if (!res.data.employee) console.log("onboard failed:", res.status, JSON.stringify(res.data));
      return res.data.employee;
    };

    // 1. Onboarding with the toggle on
    const noCtc = await onboard('Exempt NoCtc', { attendanceExempt: true });
    const withCtc = await onboard('Exempt WithCtc', { attendanceExempt: true, annualCtc: 600000 });
    const noAmount = await onboard('Exempt NoAmount', { attendanceExempt: true });
    check('Onboarding stores attendanceExempt', noCtc?.attendanceExempt === true);

    const empLogin = await makeRequest('/api/auth/login', 'POST', {
      email: noCtc.email,
      password: 'employee123',
    });
    const empToken = empLogin.data.token;

    // 2. No punch in/out
    const checkIn = await makeRequest('/api/attendance/check-in', 'POST', { workMode: 'Office' }, empToken);
    check('Check-in is refused with 403', checkIn.status === 403, `got ${checkIn.status}`);
    const checkOut = await makeRequest('/api/attendance/check-out', 'POST', {}, empToken);
    check('Check-out is refused with 403', checkOut.status === 403, `got ${checkOut.status}`);

    const today = await makeRequest('/api/attendance/today', 'GET', null, empToken);
    check('Today status reports attendanceExempt', today.data.attendanceExempt === true);

    // 3. Never absent
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = prev.getMonth() + 1;
    const year = prev.getFullYear();
    const monthly = await makeRequest(`/api/attendance/my-monthly?month=${month}&year=${year}`, 'GET', null, empToken);
    const statuses = (monthly.data.monthlyDays || []).map((d) => d.status);
    check('Monthly view has no Absent days', !statuses.includes('Absent'), statuses.join(','));
    check('Monthly view shows Not Tracked days', statuses.includes('Not Tracked'));
    check('Absent count is 0', monthly.data.stats?.absentCount === 0);

    // 4. Employee can't switch it off for themselves
    await makeRequest('/api/users/profile', 'PUT', { attendanceExempt: false }, empToken);
    check(
      'Employee cannot change their own flag',
      (await User.findById(noCtc._id)).attendanceExempt === true
    );

    // 5. Payroll preview: listed for HR to fill in, not skipped
    await Salary.deleteMany({ month, year });
    const preview = await makeRequest('/api/payroll/run', 'POST', { month, year, dryRun: true }, adminToken);
    const previewFor = (id) => preview.data.payslips.find((p) => p.userId === id);
    check('Preview includes the exempt employee with no CTC', previewFor(noCtc._id)?.manualPay === true);
    check('No-CTC suggestion is 0', previewFor(noCtc._id)?.netSalary === 0);
    const suggested = previewFor(withCtc._id)?.netSalary;
    check('CTC employee suggestion is their full monthly pay', suggested > 0, `got ${suggested}`);
    check('No absence LOP for exempt employees', previewFor(withCtc._id)?.lop.absentDays === 0);

    // 6. Commit with HR amounts
    const run = await makeRequest(
      '/api/payroll/run',
      'POST',
      {
        month,
        year,
        dryRun: false,
        amounts: { [noCtc._id]: 25000, [withCtc._id]: suggested },
      },
      adminToken
    );
    check('Payroll run succeeds', run.status === 201, JSON.stringify(run.data));

    const typed = await Salary.findOne({ userId: noCtc._id, month, year });
    check('HR-typed amount is paid as-is', typed?.netSalary === 25000, `got ${typed?.netSalary}`);
    check('Payslip notes it was entered by HR', /entered by HR/.test(typed?.remarks || ''));

    const accepted = await Salary.findOne({ userId: withCtc._id, month, year });
    const suggestedSlip = previewFor(withCtc._id);
    check(
      'Accepted suggestion keeps the structure breakdown',
      accepted?.netSalary === suggested &&
        accepted?.grossSalary === suggestedSlip.grossSalary &&
        accepted?.deductions.pf === suggestedSlip.deductions.pf &&
        accepted?.deductions.tax === suggestedSlip.deductions.tax,
      JSON.stringify({ saved: accepted?.deductions, preview: suggestedSlip.deductions })
    );

    check(
      'Exempt employee with no amount is skipped, not paid 0',
      !(await Salary.findOne({ userId: noAmount._id, month, year })) &&
        run.data.skipped.some((s) => s.employeeId === noAmount.employeeId)
    );

    // 7. Toggle off → punch comes back
    const toggleOff = await makeRequest(`/api/users/${noCtc._id}`, 'PUT', { attendanceExempt: false }, adminToken);
    check('Admin can turn the toggle off', toggleOff.data.employee?.attendanceExempt === false);
    const checkInAgain = await makeRequest('/api/attendance/check-in', 'POST', { workMode: 'Office' }, empToken);
    check('Check-in allowed again once tracked', checkInAgain.status !== 403, `got ${checkInAgain.status}`);
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n🎉 All attendance-exempt checks passed');
  process.exit(failures ? 1 : 0);
}

runAttendanceExemptTest();
