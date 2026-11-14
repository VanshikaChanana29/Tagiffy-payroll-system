// Employee exits: HR records a resignation / termination with the last working
// day; the account deactivates once that day has passed, and the exit stays
// in the register.
//
// Uses a throwaway in-memory database.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5058';
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'SMTP_HOST']) process.env[k] = '';

const mongoose = require('mongoose');

async function runExitTest() {
  console.log('🧪 Starting Employee Exit Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) await new Promise((r) => setTimeout(r, 300));
  const User = require('./models/User');
  const EmployeeExit = require('./models/EmployeeExit');
  const { processDueExits } = require('./utils/exitScheduler');
  while ((await User.countDocuments()) === 0) await new Promise((r) => setTimeout(r, 300));

  const base = `http://localhost:${process.env.PORT}`;
  const call = async (path, method = 'GET', body = null, token = null) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  for (;;) {
    try { await fetch(`${base}/api/health`); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
  }

  let failures = 0;
  const check = (label, condition, detail = '') => {
    if (condition) console.log(`  ✅ ${label}`);
    else { failures += 1; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
  };

  const ymd = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  try {
    const login = async (email, password) => (await call('/api/auth/login', 'POST', { email, password })).data.token;
    const ownerToken = await login('owner@dayflow.com', 'owner123');
    const adminToken = await login('admin@dayflow.com', 'admin123');
    const alexToken = await login('alex@dayflow.com', 'employee123');

    const alex = await User.findOne({ email: 'alex@dayflow.com' });
    const owner = await User.findOne({ email: 'owner@dayflow.com' });
    const admin = await User.findOne({ email: 'admin@dayflow.com' });
    const others = await User.find({ role: 'employee', status: 'Active', _id: { $ne: alex._id } }).limit(2);
    const [emp2, emp3] = others;

    const denied = await call('/api/exits', 'GET', null, alexToken);
    check('Employees cannot see the exit register', denied.status === 403, `got ${denied.status}`);

    // Resignation with a future last working day: stays active (serving notice).
    const resign = await call('/api/exits', 'POST', {
      employeeId: alex._id, exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(30), reason: 'Relocating',
    }, adminToken);
    check('HR records a resignation', resign.status === 201, JSON.stringify(resign.data));
    check('Future last working day → serving notice', resign.data.exit?.status === 'Serving Notice');
    check('Still active while serving notice', (await User.findById(alex._id)).status === 'Active');
    check('Can still log in while serving notice', Boolean(await login('alex@dayflow.com', 'employee123')));
    check('Details are snapshotted', resign.data.exit?.snapshot?.name === alex.name && resign.data.exit?.snapshot?.employeeId === alex.employeeId);

    const dup = await call('/api/exits', 'POST', {
      employeeId: alex._id, exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(10),
    }, adminToken);
    check('Cannot record a second exit while one is pending', dup.status === 400);

    // Validation
    const badDates = await call('/api/exits', 'POST', {
      employeeId: emp2._id, exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(-5),
    }, adminToken);
    check('Last working day before resignation date is rejected', badDates.status === 400);
    const badType = await call('/api/exits', 'POST', {
      employeeId: emp2._id, exitType: 'Fired', noticeDate: ymd(0), lastWorkingDay: ymd(0),
    }, adminToken);
    check('Unknown exit type is rejected', badType.status === 400);
    const self = await call('/api/exits', 'POST', {
      employeeId: admin._id, exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(5),
    }, adminToken);
    check('HR cannot record their own exit', self.status === 403);
    const adminOnAdmin = await call('/api/exits', 'POST', {
      employeeId: owner._id, exitType: 'Terminated', noticeDate: ymd(0), lastWorkingDay: ymd(0),
    }, adminToken);
    check('HR admin cannot record an exit for another admin', adminOnAdmin.status === 403);

    // Termination already in the past: deactivated immediately.
    const term = await call('/api/exits', 'POST', {
      employeeId: emp2._id, exitType: 'Terminated', noticeDate: ymd(-3), lastWorkingDay: ymd(-1), reason: 'Policy violation',
    }, adminToken);
    check('HR records a termination', term.status === 201, JSON.stringify(term.data));
    check('Past last working day → exited', term.data.exit?.status === 'Exited');
    check('Account deactivated immediately', (await User.findById(emp2._id)).status === 'Inactive');
    const blocked = await call('/api/auth/login', 'POST', { email: emp2.email, password: 'employee123' });
    check('Exited employee can no longer log in', blocked.status === 403, `got ${blocked.status}`);

    // Last working day = today: still works today.
    const today = await call('/api/exits', 'POST', {
      employeeId: emp3._id, exitType: 'Resigned', noticeDate: ymd(-30), lastWorkingDay: ymd(0),
    }, adminToken);
    check('Last working day today → still serving notice', today.data.exit?.status === 'Serving Notice');
    check('Active on their last working day', (await User.findById(emp3._id)).status === 'Active');

    // Scheduler: once the last working day passes, they are deactivated.
    await EmployeeExit.updateOne({ _id: today.data.exit._id }, { lastWorkingDay: new Date(Date.now() - 86400000 * 2) });
    await processDueExits();
    check('Scheduler deactivates after the last working day', (await User.findById(emp3._id)).status === 'Inactive');

    // Rehire: reactivation by hand is not undone by the scheduler.
    await call(`/api/users/${emp3._id}`, 'PUT', { status: 'Active' }, adminToken);
    await processDueExits();
    check('Manual reactivation sticks', (await User.findById(emp3._id)).status === 'Active');
    const reg = await call('/api/exits', 'GET', null, adminToken);
    check('Exit stays in the register after rehire', reg.data.exits?.some((e) => e._id === today.data.exit._id));

    // Edit, then withdraw the pending resignation.
    const edited = await call(`/api/exits/${resign.data.exit._id}`, 'PUT', {
      exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(45), reason: 'Relocating to Pune',
    }, adminToken);
    check('HR can correct an exit', edited.status === 200 && edited.data.exit.reason === 'Relocating to Pune');
    const withdrawn = await call(`/api/exits/${resign.data.exit._id}/withdraw`, 'POST', null, adminToken);
    check('HR can withdraw a pending resignation', withdrawn.status === 200 && withdrawn.data.exit.status === 'Withdrawn');
    await processDueExits();
    check('Withdrawn → stays active', (await User.findById(alex._id)).status === 'Active');
    const withdrawExited = await call(`/api/exits/${term.data.exit._id}/withdraw`, 'POST', null, adminToken);
    check('Cannot withdraw an exit that already happened', withdrawExited.status === 400);

    // Filters
    const serving = await call('/api/exits?status=Serving%20Notice', 'GET', null, adminToken);
    check('Filter: serving notice', serving.data.exits.every((e) => e.status === 'Serving Notice'));
    const terminated = await call('/api/exits?type=Terminated', 'GET', null, adminToken);
    check('Filter: terminated', terminated.data.exits.length === 1 && terminated.data.exits[0].exitType === 'Terminated');

    // Super admin can record an exit for an admin.
    const superOnAdmin = await call('/api/exits', 'POST', {
      employeeId: admin._id, exitType: 'Resigned', noticeDate: ymd(0), lastWorkingDay: ymd(20),
    }, ownerToken);
    check('Super admin can record an exit for an admin', superOnAdmin.status === 201, JSON.stringify(superOnAdmin.data));
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures === 0 ? '\n🎉 All Employee Exit tests passed' : `\n⚠️  ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

runExitTest();
