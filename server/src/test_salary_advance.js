// Advance salary: admin-only, recovered from the next payslip(s), never twice.
//
// Runs payroll for real, which writes payslips for every active employee, so it
// always uses a throwaway in-memory database and never touches server/.env's DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5056';

const mongoose = require('mongoose');
const request = require('http');

async function runSalaryAdvanceTest() {
  console.log('🧪 Starting Salary Advance Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Salary = require('./models/Salary');
  const SalaryAdvance = require('./models/SalaryAdvance');
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

    const onboard = async (name) => {
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
          joiningDate: new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1),
          // Attendance-exempt so absences never change the figures under test.
          attendanceExempt: true,
          annualCtc: 600000,
        },
        adminToken
      );
      if (!res.data.employee) console.log('onboard failed:', res.status, JSON.stringify(res.data));
      return res.data.employee;
    };

    const emp = await onboard('Advance Taker');
    const emp2 = await onboard('Manual Slip');

    // 1. Only admins may touch advances
    const empLogin = await makeRequest('/api/auth/login', 'POST', { email: emp.email, password: 'employee123' });
    const empToken = empLogin.data.token;
    const denied = await makeRequest('/api/salary-advances', 'GET', null, empToken);
    check('Employee cannot list advances', denied.status === 403, `status ${denied.status}`);
    const deniedPost = await makeRequest('/api/salary-advances', 'POST', { userId: emp._id, amount: 5000, reason: 'x' }, empToken);
    check('Employee cannot create an advance', deniedPost.status === 403, `status ${deniedPost.status}`);

    // 2. Validation
    const noReason = await makeRequest('/api/salary-advances', 'POST', { userId: emp._id, amount: 5000, reason: '  ' }, adminToken);
    check('Reason is required', noReason.status === 400, `status ${noReason.status}`);
    const badAmount = await makeRequest('/api/salary-advances', 'POST', { userId: emp._id, amount: -5, reason: 'x' }, adminToken);
    check('Amount must be positive', badAmount.status === 400, `status ${badAmount.status}`);

    // 3. Record an advance
    const created = await makeRequest('/api/salary-advances', 'POST', {
      userId: emp._id, amount: 10000, reason: 'Medical emergency', givenOn: '2026-01-10',
    }, adminToken);
    check('Admin records an advance', created.status === 201 && created.data.advance?.status === 'Pending', JSON.stringify(created.data));

    const list = await makeRequest(`/api/salary-advances?userId=${emp._id}`, 'GET', null, adminToken);
    check('Advance is listed with outstanding amount', list.data.advances?.[0]?.outstanding === 10000, JSON.stringify(list.data));

    // 4. Payroll preview deducts it
    const now = new Date();
    const month1 = now.getMonth() === 0 ? 12 : now.getMonth(); // last month
    const year1 = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const preview = await makeRequest('/api/payroll/run', 'POST', { month: month1, year: year1, dryRun: true }, adminToken);
    const row = preview.data.payslips?.find((p) => p.userId === emp._id);
    check('Preview includes employee', !!row, JSON.stringify(preview.data).slice(0, 300));
    check('Preview shows advance deduction', row?.deductions?.advance === 10000, JSON.stringify(row?.deductions));
    check('Preview net is pay minus advance', row && row.netSalary === row.netBeforeAdvance - 10000, `${row?.netSalary} vs ${row?.netBeforeAdvance}`);
    check('Dry run does not recover anything', (await SalaryAdvance.findById(created.data.advance._id)).recoveredAmount === 0);

    // 5. Commit: HR keeps the suggested pay for the exempt employee
    const amounts = { [emp._id]: row.netBeforeAdvance };
    const run = await makeRequest('/api/payroll/run', 'POST', { month: month1, year: year1, dryRun: false, amounts }, adminToken);
    check('Payroll run succeeds', run.status === 201, JSON.stringify(run.data));
    const slip = await Salary.findOne({ userId: emp._id, month: month1, year: year1 });
    check('Payslip stores advance deduction', slip?.deductions?.advance === 10000, JSON.stringify(slip?.deductions));
    check('Payslip net has advance taken off', slip?.netSalary === row.netBeforeAdvance - 10000, `${slip?.netSalary}`);
    check('Payslip remarks mention the reason', /Medical emergency/.test(slip?.remarks || ''), slip?.remarks);
    const adv = await SalaryAdvance.findById(created.data.advance._id);
    check('Advance marked Recovered', adv.status === 'Recovered' && adv.recoveredAmount === 10000, `${adv.status} ${adv.recoveredAmount}`);

    // 6. Next month: nothing is deducted again
    const month2 = month1 === 12 ? 1 : month1 + 1;
    const year2 = month1 === 12 ? year1 + 1 : year1;
    const preview2 = await makeRequest('/api/payroll/run', 'POST', { month: month2, year: year2, dryRun: true }, adminToken);
    const row2 = preview2.data.payslips?.find((p) => p.userId === emp._id);
    check('Recovered advance is not deducted again', row2 && (row2.deductions.advance || 0) === 0, JSON.stringify(row2?.deductions));

    // 7. Advance bigger than a month's pay carries over
    const big = await makeRequest('/api/salary-advances', 'POST', { userId: emp._id, amount: 80000, reason: 'House deposit' }, adminToken);
    const preview3 = await makeRequest('/api/payroll/run', 'POST', { month: month2, year: year2, dryRun: true }, adminToken);
    const row3 = preview3.data.payslips?.find((p) => p.userId === emp._id);
    check('Large advance takes the whole net pay', row3?.netSalary === 0 && row3?.deductions.advance === row3?.netBeforeAdvance, JSON.stringify(row3?.deductions));
    check('Remainder carries forward', row3?.advanceRecovery?.carryForward === 80000 - row3?.netBeforeAdvance, JSON.stringify(row3?.advanceRecovery));

    // 8. Cancel stops recovery
    const cancel = await makeRequest(`/api/salary-advances/${big.data.advance._id}/cancel`, 'PUT', null, adminToken);
    check('Admin cancels an advance', cancel.status === 200 && cancel.data.advance?.status === 'Cancelled', JSON.stringify(cancel.data));
    const preview4 = await makeRequest('/api/payroll/run', 'POST', { month: month2, year: year2, dryRun: true }, adminToken);
    const row4 = preview4.data.payslips?.find((p) => p.userId === emp._id);
    check('Cancelled advance is not deducted', (row4?.deductions.advance || 0) === 0, JSON.stringify(row4?.deductions));
    const cancelAgain = await makeRequest(`/api/salary-advances/${big.data.advance._id}/cancel`, 'PUT', null, adminToken);
    check('Cannot cancel twice', cancelAgain.status === 400, `status ${cancelAgain.status}`);

    // 9. Manually generated payslip also recovers
    await makeRequest('/api/salary-advances', 'POST', { userId: emp2._id, amount: 7000, reason: 'Travel' }, adminToken);
    const manual = await makeRequest('/api/salaries', 'POST', {
      userId: emp2._id, month: month2, year: year2, basicSalary: 50000,
    }, adminToken);
    check('Manual payslip deducts advance', manual.data.salary?.deductions?.advance === 7000 && manual.data.salary?.netSalary === 43000, JSON.stringify(manual.data));
    // Editing the payslip keeps the advance line
    const edited = await makeRequest(`/api/salaries/${manual.data.salary?._id}`, 'PUT', {
      incentive: 1000, deductions: { other: 0, advance: 0 },
    }, adminToken);
    check('Editing keeps advance deduction', edited.data.salary?.deductions?.advance === 7000 && edited.data.salary?.netSalary === 44000, JSON.stringify(edited.data.salary?.deductions));
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n🎉 All salary advance checks passed');
  process.exit(failures ? 1 : 0);
}

runSalaryAdvanceTest();
