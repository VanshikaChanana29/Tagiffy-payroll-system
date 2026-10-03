// HR password reset: admin resets employees, only a super admin resets admins,
// nobody resets their own, and managers/employees can't reset anyone.
//
// Changes passwords for real, so it always uses a throwaway in-memory database
// and never touches server/.env's DB.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5056';

const mongoose = require('mongoose');
const request = require('http');

async function runPasswordResetTest() {
  console.log('🧪 Starting HR Password Reset Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Notification = require('./models/Notification');
  // Let the startup seed finish so it doesn't race our own accounts.
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

  const PASSWORD = 'Start@123';
  const makeUser = (employeeId, role) =>
    User.create({
      employeeId,
      name: `PR ${role} ${employeeId}`,
      email: `${employeeId.toLowerCase()}@pwreset.test`,
      password: PASSWORD,
      role,
      isVerified: true,
      status: 'Active',
    });
  const login = async (email, password) => {
    const res = await makeRequest('/api/auth/login', 'POST', { email, password });
    return res.data.token || null;
  };
  const reset = (target, newPassword, token) =>
    makeRequest(`/api/users/${target._id}/password`, 'PUT', { newPassword }, token);

  try {
    const superAdmin = await makeUser('PRSA1', 'super_admin');
    const admin = await makeUser('PRAD1', 'admin');
    const admin2 = await makeUser('PRAD2', 'admin');
    const manager = await makeUser('PRMG1', 'manager');
    const employee = await makeUser('PREM1', 'employee');
    const employee2 = await makeUser('PREM2', 'employee');

    const superToken = await login(superAdmin.email, PASSWORD);
    const adminToken = await login(admin.email, PASSWORD);
    const managerToken = await login(manager.email, PASSWORD);
    const empToken = await login(employee.email, PASSWORD);
    check('All test accounts can log in', superToken && adminToken && managerToken && empToken);

    // 1. Admin → employee: allowed, old password dies, new one works, employee notified
    console.log('\n1. Admin resets an employee');
    const r1 = await reset(employee2, 'NewEmp@456', adminToken);
    check('Admin can reset an employee password', r1.status === 200, `got ${r1.status} ${r1.data?.message}`);
    check('Old password no longer works', !(await login(employee2.email, PASSWORD)));
    check('New password works', !!(await login(employee2.email, 'NewEmp@456')));
    const stored = await User.findById(employee2._id);
    check('Password is stored hashed, not plain text', stored.password !== 'NewEmp@456' && stored.password.startsWith('$2'));
    const note = await Notification.findOne({ recipient: employee2._id, type: 'password_reset_by_hr' });
    check('Employee gets a password-reset notification', !!note);
    check('Notification does not contain the new password', note && !note.message.includes('NewEmp@456'));
    const r1m = await reset(manager, 'NewMgr@456', adminToken);
    check('Admin can reset a manager password', r1m.status === 200, `got ${r1m.status}`);

    // 2. Admin → admin / super admin: blocked
    console.log('\n2. Admin tries to reset another admin');
    const r2 = await reset(admin2, 'Hacked@1', adminToken);
    check('Admin cannot reset another admin', r2.status === 403, `got ${r2.status}`);
    check('That admin can still use their old password', !!(await login(admin2.email, PASSWORD)));
    const r2s = await reset(superAdmin, 'Hacked@1', adminToken);
    check('Admin cannot reset the super admin', r2s.status === 403, `got ${r2s.status}`);

    // 3. Super admin → admin: allowed
    console.log('\n3. Super admin resets an admin');
    const r3 = await reset(admin2, 'NewAdm@789', superToken);
    check('Super admin can reset an admin password', r3.status === 200, `got ${r3.status}`);
    check('Admin can log in with the new password', !!(await login(admin2.email, 'NewAdm@789')));
    const r3e = await reset(employee, 'NewEmp@999', superToken);
    check('Super admin can reset an employee password', r3e.status === 200, `got ${r3e.status}`);

    // 4. Nobody resets their own here
    console.log('\n4. Resetting your own password is blocked');
    const r4a = await reset(admin, 'Self@123', adminToken);
    check('Admin cannot reset their own password here', r4a.status === 400, `got ${r4a.status}`);
    const r4s = await reset(superAdmin, 'Self@123', superToken);
    check('Super admin cannot reset their own password here', r4s.status === 400, `got ${r4s.status}`);
    check('Admin still logs in with the original password', !!(await login(admin.email, PASSWORD)));

    // 5. Managers and employees can't reset anyone
    console.log('\n5. Managers and employees are blocked');
    const r5m = await reset(employee2, 'Mgr@1234', managerToken);
    check('Manager cannot reset an employee password', r5m.status === 403, `got ${r5m.status}`);
    const r5e = await reset(employee2, 'Emp@1234', empToken);
    check('Employee cannot reset another employee password', r5e.status === 403, `got ${r5e.status}`);
    const r5n = await reset(employee2, 'Anon@123', null);
    check('Logged-out request is rejected', r5n.status === 401, `got ${r5n.status}`);

    // 6. Input checks
    console.log('\n6. Input checks');
    const r6 = await reset(employee2, '123', adminToken);
    check('Password shorter than 6 characters is rejected', r6.status === 400, `got ${r6.status}`);
    const r6m = await reset({ _id: new mongoose.Types.ObjectId() }, 'Valid@123', adminToken);
    check('Unknown employee returns 404', r6m.status === 404, `got ${r6m.status}`);
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures ? `\n❌ ${failures} check(s) failed` : '\n🎉 All password reset checks passed');
  process.exit(failures ? 1 : 0);
}

runPasswordResetTest();
