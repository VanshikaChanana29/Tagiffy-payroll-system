// Incentive sheet upload: amounts by email, added to the payroll run and to
// payslips that already exist, never counted twice.
//
// Runs payroll for real, so it always uses a throwaway in-memory database and
// never touches server/.env's DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5057';

const mongoose = require('mongoose');
const XLSX = require('xlsx');

async function runIncentiveUploadTest() {
  console.log('🧪 Starting Incentive Upload Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Salary = require('./models/Salary');
  while ((await User.countDocuments()) === 0) {
    await new Promise((r) => setTimeout(r, 300));
  }

  const base = `http://localhost:${process.env.PORT}`;
  const call = async (path, method = 'GET', data = null, token = null) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(data && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, raw: text };
    }
  };

  const sheetBuffer = (rows, bookType = 'xlsx') => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType });
  };

  const upload = async (rows, { month, year }, token, filename = 'incentives.xlsx') => {
    const form = new FormData();
    form.append('month', String(month));
    form.append('year', String(year));
    const bookType = filename.endsWith('.csv') ? 'csv' : 'xlsx';
    form.append('file', new Blob([sheetBuffer(rows, bookType)]), filename);
    const res = await fetch(`${base}/api/payroll/incentives/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: res.status, data: await res.json() };
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
      await fetch(`${base}/api/auth/me`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  try {
    const adminLogin = await call('/api/auth/login', 'POST', {
      email: 'admin@dayflow.com',
      password: 'admin123',
    });
    const adminToken = adminLogin.data.token;
    check('Admin logs in', !!adminToken, JSON.stringify(adminLogin.data));

    const onboard = async (name, attendanceExempt = true) => {
      const res = await call(
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
          attendanceExempt,
          annualCtc: 600000,
        },
        adminToken
      );
      if (!res.data.employee) console.log('onboard failed:', res.status, JSON.stringify(res.data));
      return res.data.employee;
    };

    const sales1 = await onboard('Sales One');
    const sales2 = await onboard('Sales Two');
    const noIncentive = await onboard('No Incentive');

    const now = new Date();
    const cycle = {
      month: now.getMonth() === 0 ? 12 : now.getMonth(),
      year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    };

    // 1. Only admins may upload
    const empLogin = await call('/api/auth/login', 'POST', { email: sales1.email, password: 'employee123' });
    const denied = await upload([['Email', 'Incentive'], [sales1.email, 5000]], cycle, empLogin.data.token);
    check('Employee cannot upload incentives', denied.status === 403, `status ${denied.status}`);

    // 2. Template lists active employees
    const tpl = await fetch(`${base}/api/payroll/incentives/template`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const tplRows = XLSX.utils.sheet_to_json(
      XLSX.read(Buffer.from(await tpl.arrayBuffer()), { type: 'buffer' }).Sheets.Incentives,
      { header: 1 }
    );
    check('Template has the right headers', tplRows[0]?.join('|') === 'Name|Email|Incentive Amount|Remarks', tplRows[0]?.join('|'));
    check('Template lists employees', tplRows.some((r) => r[1] === sales1.email), `${tplRows.length} rows`);

    // 3. Missing columns are rejected
    const noAmountCol = await upload([['Email', 'Name'], [sales1.email, 'x']], cycle, adminToken);
    check('Sheet without an amount column is rejected', noAmountCol.status === 400, JSON.stringify(noAmountCol.data));

    // 4. Upload with good and bad rows
    const res = await upload(
      [
        ['Name', 'Email', 'Incentive Amount', 'Remarks'],
        ['Sales One', sales1.email.toUpperCase(), 5000, 'Q3 target'],
        ['Sales Two', sales2.email, '₹2,500', ''],
        ['No Incentive', noIncentive.email, '', ''],
        ['Ghost', 'ghost@nowhere.com', 1000, ''],
        ['Bad', sales1.email, 'abc', ''],
        ['Dup', sales2.email, 300, ''],
      ],
      cycle,
      adminToken
    );
    check('Upload succeeds', res.status === 200, JSON.stringify(res.data));
    check('Two incentives saved, total ₹7,500', res.data.savedCount === 2 && res.data.total === 7500, JSON.stringify(res.data));
    check('Blank amount row is ignored, not an error', res.data.ignoredCount === 1, JSON.stringify(res.data));
    check('Unknown email, bad amount and duplicate are reported', res.data.failedCount === 3, JSON.stringify(res.data.failed));

    const list = await call(`/api/payroll/incentives?month=${cycle.month}&year=${cycle.year}`, 'GET', null, adminToken);
    check('Incentives are listed for the month', list.data.incentives?.length === 2 && list.data.total === 7500, JSON.stringify(list.data));

    // 5. Payroll preview and run add them
    const amountsFor = (payslips) =>
      Object.fromEntries(payslips.filter((p) => p.manualPay).map((p) => [p.userId, p.netBeforeAdvance]));
    const preview = await call('/api/payroll/run', 'POST', { ...cycle, dryRun: true }, adminToken);
    const row1 = preview.data.payslips?.find((p) => p.userId === sales1._id);
    const row3 = preview.data.payslips?.find((p) => p.userId === noIncentive._id);
    check('Preview adds incentive to net', row1?.incentive === 5000 && row1.netSalary === row1.netBeforeAdvance + 5000, JSON.stringify(row1));
    check('Preview leaves others alone', row3?.incentive === 0 && row3.netSalary === row3.netBeforeAdvance, JSON.stringify(row3));
    check('Preview totals include incentives', preview.data.totals?.incentive >= 7500, JSON.stringify(preview.data.totals));

    // HR types a different figure for one exempt employee: incentive still on top.
    const amounts = amountsFor(preview.data.payslips);
    amounts[sales2._id] = 40000;
    const run = await call('/api/payroll/run', 'POST', { ...cycle, dryRun: false, amounts }, adminToken);
    check('Payroll run succeeds', run.status === 201, JSON.stringify(run.data));
    const slip1 = await Salary.findOne({ userId: sales1._id, ...cycle });
    const slip2 = await Salary.findOne({ userId: sales2._id, ...cycle });
    check('Payslip stores incentive', slip1?.incentive === 5000 && slip1.netSalary === row1.netBeforeAdvance + 5000, `${slip1?.incentive} ${slip1?.netSalary}`);
    check('Incentive added on top of HR-typed pay', slip2?.incentive === 2500 && slip2.netSalary === 42500, `${slip2?.incentive} ${slip2?.netSalary}`);
    check('Payslip remarks mention the incentive', /Incentive: ₹5,000/.test(slip1?.remarks || ''), slip1?.remarks);

    // 6. Re-upload after payslips exist updates them in place, no double count
    const reup = await upload(
      [['email', 'amount'], [sales1.email, 6000], [sales2.email, 0], [noIncentive.email, 1500]],
      cycle,
      adminToken,
      'incentives.csv'
    );
    check('CSV re-upload succeeds', reup.status === 200 && reup.data.savedCount === 2 && reup.data.removedCount === 1, JSON.stringify(reup.data));
    check('Existing payslips are updated', reup.data.payslipsUpdated === 3, JSON.stringify(reup.data));
    const s1 = await Salary.findOne({ userId: sales1._id, ...cycle });
    const s2 = await Salary.findOne({ userId: sales2._id, ...cycle });
    const s3 = await Salary.findOne({ userId: noIncentive._id, ...cycle });
    check('Incentive replaced, not added twice', s1.incentive === 6000 && s1.netSalary === row1.netBeforeAdvance + 6000, `${s1.incentive} ${s1.netSalary}`);
    check('0 removes the incentive', s2.incentive === 0 && s2.netSalary === 40000, `${s2.incentive} ${s2.netSalary}`);
    check('New incentive lands on existing payslip', s3.incentive === 1500 && s3.netSalary === row3.netBeforeAdvance + 1500, `${s3.incentive} ${s3.netSalary}`);

    // 7. Running payroll again does not touch existing payslips
    await call('/api/payroll/run', 'POST', { ...cycle, dryRun: false, amounts: {} }, adminToken);
    const again = await Salary.findOne({ userId: sales1._id, ...cycle });
    check('Second run leaves incentive unchanged', again.incentive === 6000 && again.netSalary === s1.netSalary, `${again.incentive} ${again.netSalary}`);

    // 8. Removing an incentive clears it from the payslip
    const list2 = await call(`/api/payroll/incentives?month=${cycle.month}&year=${cycle.year}`, 'GET', null, adminToken);
    const inc3 = list2.data.incentives.find((i) => i.userId._id === noIncentive._id);
    const del = await call(`/api/payroll/incentives/${inc3._id}`, 'DELETE', null, adminToken);
    const s3b = await Salary.findOne({ userId: noIncentive._id, ...cycle });
    check('Delete removes incentive from payslip', del.status === 200 && s3b.incentive === 0 && s3b.netSalary === row3.netBeforeAdvance, `${s3b.incentive} ${s3b.netSalary}`);
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n🎉 All incentive upload checks passed');
  process.exit(failures ? 1 : 0);
}

runIncentiveUploadTest();
