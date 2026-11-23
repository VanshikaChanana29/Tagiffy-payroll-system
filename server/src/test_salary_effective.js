// CTC revisions with an effective month: an increment agreed this month but
// effective from next month must not change this month's payroll.
//
// Runs payroll for real, so it always uses a throwaway in-memory database and
// never touches server/.env's DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5056';

const mongoose = require('mongoose');
const request = require('http');

async function runSalaryEffectiveTest() {
  console.log('🧪 Starting Salary Effective-Month Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Salary = require('./models/Salary');
  while ((await User.countDocuments()) === 0) {
    await new Promise((r) => setTimeout(r, 300));
  }

  const makeRequest = (path, method = 'GET', data = null, token = null) =>
    new Promise((resolve, reject) => {
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

  const now = new Date();
  const cur = { month: now.getMonth() + 1, year: now.getFullYear() };
  const nxtDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nxt = { month: nxtDate.getMonth() + 1, year: nxtDate.getFullYear() };
  const key = ({ month, year }) => `${year}-${String(month).padStart(2, '0')}`;

  try {
    const adminLogin = await makeRequest('/api/auth/login', 'POST', {
      email: 'admin@dayflow.com',
      password: 'admin123',
    });
    const adminToken = adminLogin.data.token;
    check('Admin logs in', !!adminToken, JSON.stringify(adminLogin.data));

    const onboard = async (name, extra = {}) => {
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
          joiningDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
          ...extra,
        },
        adminToken
      );
      if (!res.data.employee) console.log('onboard failed:', res.status, JSON.stringify(res.data));
      return res.data.employee;
    };

    const revise = (id, body) => makeRequest(`/api/users/${id}/salary`, 'PUT', body, adminToken);
    const preview = async ({ month, year }) =>
      (await makeRequest('/api/payroll/run', 'POST', { month, year, dryRun: true }, adminToken)).data;
    const grossFor = async (period, id) =>
      (await preview(period)).payslips?.find((p) => p.userId === id)?.grossSalary;

    // 1. Increment agreed now, effective next month
    const emp = await onboard('Effective Raise', { annualCtc: 600000 });
    check('Employee onboarded with CTC', emp?.salary?.monthlyGross === 50000, JSON.stringify(emp?.salary));

    const raise = await revise(emp._id, { annualCtc: 720000, effectiveFrom: key(nxt), note: 'Appraisal' });
    check('Revision saved', raise.status === 200, JSON.stringify(raise.data));
    check('Old CTC archived to history', raise.data.salaryHistory?.length === 1);
    check(
      'Effective date stored as 1st of next month',
      new Date(raise.data.salary?.effectiveFrom).toISOString() ===
        new Date(Date.UTC(nxt.year, nxt.month - 1, 1)).toISOString(),
      raise.data.salary?.effectiveFrom
    );

    check('This month payroll uses OLD salary', (await grossFor(cur, emp._id)) === 50000, `got ${await grossFor(cur, emp._id)}`);
    check('Next month payroll uses NEW salary', (await grossFor(nxt, emp._id)) === 60000, `got ${await grossFor(nxt, emp._id)}`);

    // 2. Legacy entry made before this fix: dated mid this month (the bug)
    const legacy = await onboard('Legacy Raise', { annualCtc: 600000 });
    await revise(legacy._id, { annualCtc: 720000, effectiveFrom: key(cur) });
    await User.updateOne(
      { _id: legacy._id },
      { 'salary.effectiveFrom': new Date(now.getFullYear(), now.getMonth(), 16) }
    );
    check('Legacy mid-month entry applies to this month', (await grossFor(cur, legacy._id)) === 60000);

    // A plain re-entry effective next month would NOT fix it — correction does.
    const fix = await revise(legacy._id, { annualCtc: 720000, effectiveFrom: key(nxt), correction: true });
    check('Correction saved', fix.status === 200, JSON.stringify(fix.data));
    check('Correction does not add a history entry', fix.data.salaryHistory?.length === 1, `history ${fix.data.salaryHistory?.length}`);
    check('After correction: this month uses OLD salary', (await grossFor(cur, legacy._id)) === 50000, `got ${await grossFor(cur, legacy._id)}`);
    check('After correction: next month uses NEW salary', (await grossFor(nxt, legacy._id)) === 60000);

    // 3. Backdated revision overrides the queued one
    const back = await revise(emp._id, { annualCtc: 660000, effectiveFrom: key(cur) });
    check('Backdated revision saved', back.status === 200);
    check('Backdated: this month uses it', (await grossFor(cur, emp._id)) === 55000, `got ${await grossFor(cur, emp._id)}`);
    check('Backdated: replaces the queued raise for next month', (await grossFor(nxt, emp._id)) === 55000, `got ${await grossFor(nxt, emp._id)}`);

    // 4. Existing payslips are reported, never recalculated
    const bystanders = await User.find({
      _id: { $ne: emp._id },
      email: { $ne: 'admin@dayflow.com' },
    }).select('_id');
    await Salary.deleteMany({ month: cur.month, year: cur.year });
    // Only pay this employee; others' payslips are irrelevant here.
    await User.updateMany({ _id: { $in: bystanders.map((b) => b._id) } }, { status: 'Inactive' });
    const run = await makeRequest('/api/payroll/run', 'POST', { ...cur, dryRun: false }, adminToken);
    check('Payroll run succeeds', run.status === 201, JSON.stringify(run.data).slice(0, 300));
    const slip = await Salary.findOne({ userId: emp._id, ...cur });
    check('Payslip used the salary in effect', slip?.grossSalary === 55000, `got ${slip?.grossSalary}`);
    await User.updateMany({ _id: { $in: bystanders.map((b) => b._id) } }, { status: 'Active' });

    const late = await revise(emp._id, { annualCtc: 780000, effectiveFrom: key(cur) });
    check('Save message warns about generated payslip', /already generated/.test(late.data.message || ''), late.data.message);
    check('Generated payslip left unchanged', (await Salary.findOne({ userId: emp._id, ...cur }))?.grossSalary === 55000);

    // 5. First CTC starting next month: nothing to pay this month
    const fresh = await onboard('Future Start');
    await revise(fresh._id, { annualCtc: 480000, effectiveFrom: key(nxt) });
    const curPreview = await preview(cur);
    const skippedFresh = curPreview.skipped?.find((s) => s.employeeId === fresh.employeeId);
    check('Skipped this month with a clear reason', /later month/.test(skippedFresh?.reason || ''), JSON.stringify(skippedFresh));
    check('Paid from next month', (await grossFor(nxt, fresh._id)) === 40000);

    // 6. Validation and defaults
    const bad = await revise(emp._id, { annualCtc: 700000, effectiveFrom: 'not-a-month' });
    check('Invalid month rejected', bad.status === 400, `got ${bad.status}`);
    const noDate = await revise(fresh._id, { annualCtc: 500000 });
    check(
      'No month given defaults to this month',
      new Date(noDate.data.salary?.effectiveFrom).getUTCMonth() + 1 === cur.month
    );

    // 7. Profile API carries history for the salary card
    const profile = await makeRequest(`/api/users/${emp._id}`, 'GET', null, adminToken);
    check('Profile includes salaryHistory', Array.isArray(profile.data.employee?.salaryHistory));
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n🎉 All salary effective-month checks passed');
  process.exit(failures ? 1 : 0);
}

runSalaryEffectiveTest();
