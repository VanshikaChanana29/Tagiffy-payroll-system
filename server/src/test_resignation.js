// Portal resignations: an employee resigns from the portal, HR and their
// manager are notified, and either one accepts (setting the last working day,
// which creates an exit register entry) or rejects it.
//
// Uses a throwaway in-memory database.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5059';
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'SMTP_HOST']) process.env[k] = '';

const mongoose = require('mongoose');

async function runResignationTest() {
  console.log('🧪 Starting Resignation Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) await new Promise((r) => setTimeout(r, 300));
  const User = require('./models/User');
  const EmployeeExit = require('./models/EmployeeExit');
  const Notification = require('./models/Notification');
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

  const toYmd = (v) => {
    const d = new Date(v);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

    const vikramToken = await login('vikram@dayflow.com', 'manager123');
    const karthikToken = await login('karthik@dayflow.com', 'employee123');
    const alex = await User.findOne({ email: 'alex@dayflow.com' });
    const vikram = await User.findOne({ email: 'vikram@dayflow.com' });
    const admin = await User.findOne({ email: 'admin@dayflow.com' });

    // Validation
    const noReason = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: '' }, alexToken);
    check('Reason is required', noReason.status === 400);
    const badDate = await call('/api/resignations', 'POST', { resignationDate: '2026-02-31', reason: 'Moving' }, alexToken);
    check('Invalid date rejected', badDate.status === 400);

    // Submit → HR + manager notified
    const first = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: 'Higher studies' }, alexToken);
    check('Employee can submit a resignation', first.status === 201 && first.data.resignation.status === 'Pending', JSON.stringify(first.data));
    await new Promise((r) => setTimeout(r, 300));
    const notes = await Notification.find({ type: 'resignation_submitted' });
    const notified = notes.map((n) => n.recipient.toString());
    check('Manager is notified', notified.includes(vikram._id.toString()));
    check('HR is notified', notified.includes(admin._id.toString()));
    check('Employee is not notified of their own submission', !notified.includes(alex._id.toString()));

    const dup = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: 'Again' }, alexToken);
    check('Cannot submit twice while pending', dup.status === 400);

    // Withdraw by employee
    const w = await call(`/api/resignations/${first.data.resignation._id}/withdraw`, 'POST', null, alexToken);
    check('Employee can withdraw a pending resignation', w.status === 200 && w.data.resignation.status === 'Withdrawn');

    // Scoping
    const second = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: 'Relocating' }, alexToken);
    const id = second.data.resignation._id;
    const mgrList = await call('/api/resignations?status=Pending', 'GET', null, vikramToken);
    check('Manager sees their report resignation', mgrList.status === 200 && mgrList.data.resignations.some((r) => r._id === id));
    const empList = await call('/api/resignations', 'GET', null, karthikToken);
    check('An employee cannot list resignations', empList.status === 403);
    const peerAccept = await call(`/api/resignations/${id}/accept`, 'POST', { lastWorkingDay: ymd(30) }, karthikToken);
    check('A peer cannot accept', peerAccept.status === 403);
    const selfAccept = await call(`/api/resignations/${id}/accept`, 'POST', { lastWorkingDay: ymd(30) }, alexToken);
    check('Employee cannot accept their own', selfAccept.status === 403);

    // Accept by manager → exit register entry
    const early = await call(`/api/resignations/${id}/accept`, 'POST', { lastWorkingDay: ymd(-5) }, vikramToken);
    check('Last working day before resignation date is rejected', early.status === 400);
    const accepted = await call(`/api/resignations/${id}/accept`, 'POST', { lastWorkingDay: ymd(30), note: 'All the best' }, vikramToken);
    check('Manager can accept with a last working day', accepted.status === 200 && accepted.data.resignation.status === 'Accepted', JSON.stringify(accepted.data));
    check('Accepted shows serving notice', accepted.data.resignation.exitStatus === 'Serving Notice');
    const exit = await EmployeeExit.findById(accepted.data.resignation.exit._id);
    check('Exit register entry created as Resigned', exit && exit.exitType === 'Resigned' && exit.reason === 'Relocating');
    check('Employee stays active while serving notice', (await User.findById(alex._id)).status === 'Active');
    const again = await call(`/api/resignations/${id}/reject`, 'POST', {}, adminToken);
    check('Cannot decide twice', again.status === 400);
    const wAfter = await call(`/api/resignations/${id}/withdraw`, 'POST', null, alexToken);
    check('Employee cannot withdraw once accepted', wAfter.status === 400);
    const blocked = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: 'x y z' }, alexToken);
    check('Cannot resign again while serving notice', blocked.status === 400);
    await new Promise((r) => setTimeout(r, 300));
    check('Employee is notified of acceptance', await Notification.exists({ type: 'resignation_accepted', recipient: alex._id }));

    // Relieve early (HR only)
    const exitId = accepted.data.resignation.exit._id;
    const mgrRelieve = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(10), reason: 'Replacement found' }, vikramToken);
    check('Manager cannot relieve early', mgrRelieve.status === 403);
    const later = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(40), reason: 'x' }, adminToken);
    check('Relieve-early date must be earlier', later.status === 400);
    const relieveNoReason = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(10) }, adminToken);
    check('Relieve-early needs a reason', relieveNoReason.status === 400);
    const relieved = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(10), reason: 'Replacement found' }, adminToken);
    check('HR can relieve early', relieved.status === 200 && relieved.data.exit.status === 'Serving Notice', JSON.stringify(relieved.data));
    check('Original last working day kept', relieved.data.exit.originalLastWorkingDay && new Date(relieved.data.exit.originalLastWorkingDay).getDate() === new Date(ymd(30) + 'T00:00:00').getDate());
    const again2 = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(5), reason: 'Sooner' }, adminToken);
    check('Original survives a second move', again2.status === 200 && again2.data.exit.originalLastWorkingDay === relieved.data.exit.originalLastWorkingDay);
    const alexView = (await call('/api/resignations/mine', 'GET', null, alexToken)).data.resignations[0];
    check('Employee sees the new date and reason', toYmd(alexView.lastWorkingDay) === ymd(5) && alexView.earlyReliefReason === 'Sooner');
    await new Promise((r) => setTimeout(r, 300));
    check('Employee notified of early relief', await Notification.exists({ type: 'resignation_relieved_early', recipient: alex._id }));
    const beforeNotice = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(-1), reason: 'x' }, adminToken);
    check('Cannot relieve before the resignation date', beforeNotice.status === 400);
    const today = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(0), reason: 'Effective today' }, adminToken);
    check('Relieved today: still active for the day', today.status === 200 && today.data.exit.status === 'Serving Notice' && (await User.findById(alex._id)).status === 'Active');
    await EmployeeExit.updateOne({ _id: exitId }, { $set: { lastWorkingDay: new Date(ymd(-1) + 'T00:00:00') } });
    await require('./utils/exitScheduler').processDueExits();
    check('Deactivated once the day passes', (await User.findById(alex._id)).status === 'Inactive');
    const afterExit = await call(`/api/exits/${exitId}/relieve-early`, 'POST', { lastWorkingDay: ymd(-1), reason: 'x' }, adminToken);
    check('Cannot relieve someone who already left', afterExit.status === 400);

    // Reject by HR
    const k = await call('/api/resignations', 'POST', { resignationDate: ymd(0), reason: 'Personal' }, karthikToken);
    const rejected = await call(`/api/resignations/${k.data.resignation._id}/reject`, 'POST', { note: 'Let us talk' }, adminToken);
    check('HR can reject', rejected.status === 200 && rejected.data.resignation.status === 'Rejected');
    const mine = await call('/api/resignations/mine', 'GET', null, karthikToken);
    check('Employee sees their history', mine.data.resignations.length === 1 && mine.data.resignations[0].decisionNote === 'Let us talk');
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures === 0 ? '\n🎉 All Resignation tests passed' : `\n⚠️  ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

runResignationTest();
