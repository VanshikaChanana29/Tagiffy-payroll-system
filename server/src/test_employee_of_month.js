// Employee of the Month: admin names up to 2 winners per department, each gets
// the certificate PDF by email, and everyone sees the winners.
//
// Uses a throwaway in-memory database, and stubs the Brevo API so no real
// email is sent; the stub records what would have gone out.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable';
process.env.ALLOW_MEMORY_DB = 'true';
process.env.PORT = process.env.TEST_PORT || '5057';
process.env.BREVO_API_KEY = 'test-key';
process.env.EMAIL_FROM = 'hr@test.local';
// Keep uploads off the real R2 bucket: blank the credentials (dotenv never
// overrides a variable that is already set) and use a temp folder on disk.
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) process.env[k] = '';
process.env.UPLOAD_ROOT = require('path').join(require('os').tmpdir(), `eotm-test-${Date.now()}`);

const realFetch = global.fetch;
const sentEmails = [];
global.fetch = async (url, options) => {
  sentEmails.push({ url, body: JSON.parse(options.body) });
  return { ok: true, text: async () => '' };
};

const mongoose = require('mongoose');
const request = require('http');

async function runEmployeeOfMonthTest() {
  console.log('🧪 Starting Employee of the Month Tests...');

  require('./server');
  while (mongoose.connection.readyState !== 1) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const User = require('./models/User');
  const Notification = require('./models/Notification');
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
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks);
            try {
              resolve({ status: res.statusCode, data: JSON.parse(raw.toString()), headers: res.headers });
            } catch {
              resolve({ status: res.statusCode, raw, headers: res.headers });
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
    const login = async (email, password) =>
      (await makeRequest('/api/auth/login', 'POST', { email, password })).data.token;

    const adminToken = await login('admin@dayflow.com', 'admin123');
    const alexToken = await login('alex@dayflow.com', 'employee123');
    const elenaToken = await login('elena@dayflow.com', 'employee123');

    const alex = await User.findOne({ email: 'alex@dayflow.com' });
    const elena = await User.findOne({ email: 'elena@dayflow.com' });
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const empty = await makeRequest('/api/awards', 'GET', null, alexToken);
    check('No winners yet → empty list', empty.status === 200 && empty.data.awards.length === 0);

    const denied = await makeRequest('/api/awards', 'POST', { employeeId: alex._id, month, year }, alexToken);
    check('Employees cannot name winners', denied.status === 403, `got ${denied.status}`);

    const future = await makeRequest(
      '/api/awards', 'POST',
      { employeeId: alex._id, month: month === 12 ? 1 : month + 1, year: month === 12 ? year + 1 : year },
      adminToken
    );
    check('Future months are rejected', future.status === 400, `got ${future.status}`);

    const created = await makeRequest(
      '/api/awards', 'POST',
      { employeeId: alex._id, month, year, citation: 'Shipped the new dashboard early.' },
      adminToken
    );
    check('Admin names a winner', created.status === 201, JSON.stringify(created.data));
    check('Certificate reported as emailed', created.data.emailed === true);

    const mail = sentEmails[sentEmails.length - 1];
    const attachment = mail?.body.attachment?.[0];
    check('Email goes to the winner', mail?.body.to?.[0]?.email === alex.email);
    check('Email carries a PDF attachment', attachment && attachment.name.endsWith('.pdf'));
    check(
      'Attachment is a real PDF',
      attachment && Buffer.from(attachment.content, 'base64').subarray(0, 4).toString() === '%PDF'
    );

    const dup = await makeRequest('/api/awards', 'POST', { employeeId: alex._id, month, year }, adminToken);
    check('Same person cannot win twice in a month', dup.status === 400);

    // Fill the department up to the cap of 2, then one more must be refused.
    const sameDept = await User.find({
      department: alex.department,
      status: 'Active',
      _id: { $ne: alex._id },
    }).limit(2);
    if (sameDept.length >= 2) {
      const second = await makeRequest('/api/awards', 'POST', { employeeId: sameDept[0]._id, month, year }, adminToken);
      check('Second winner in the same department allowed', second.status === 201, JSON.stringify(second.data));
      const third = await makeRequest('/api/awards', 'POST', { employeeId: sameDept[1]._id, month, year }, adminToken);
      check('Third winner in the same department refused', third.status === 400, JSON.stringify(third.data));
    } else {
      console.log(`  ⏭️  Skipped department cap check — ${alex.department} has too few people in the seed`);
    }

    const listed = await makeRequest('/api/awards', 'GET', null, elenaToken);
    const alexAward = listed.data.awards.find((a) => a.employee._id === alex._id.toString());
    check('Everyone sees the latest winners', listed.status === 200 && alexAward);
    check('Employees do not see winner emails', alexAward && alexAward.employee.email === undefined);

    const notified = await Notification.exists({ recipient: alex._id, type: 'award_received' });
    const announced = await Notification.exists({ recipient: elena._id, type: 'award_announced' });
    check('Winner gets an in-app notification', Boolean(notified));
    check('Others get the announcement', Boolean(announced));

    const awardId = created.data.award._id;
    const ownPdf = await makeRequest(`/api/awards/${awardId}/certificate`, 'GET', null, alexToken);
    check(
      'Winner can download their certificate',
      ownPdf.status === 200 && ownPdf.raw?.subarray(0, 4).toString() === '%PDF'
    );
    const otherPdf = await makeRequest(`/api/awards/${awardId}/certificate`, 'GET', null, elenaToken);
    check("Others cannot download someone else's certificate", otherPdf.status === 403);

    const before = sentEmails.length;
    const resent = await makeRequest(`/api/awards/${awardId}/send-certificate`, 'POST', null, adminToken);
    check('Admin can resend the certificate', resent.status === 200 && sentEmails.length === before + 1);

    // --- Certificate signatures uploaded through the app ---
    const slotsRes = await makeRequest('/api/awards/certificate-images', 'GET', null, adminToken);
    check('Admin sees the 5 signature/stamp slots', slotsRes.data.slots?.length === 5);
    const slotsDenied = await makeRequest('/api/awards/certificate-images', 'GET', null, alexToken);
    check('Employees cannot see signature slots', slotsDenied.status === 403);

    // A 1x1 PNG is enough to prove the upload → storage → certificate path.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    const upload = async (key, buffer, type, token) => {
      const form = new FormData();
      form.append('image', new Blob([buffer], { type }), 'sig.png');
      const res = await realFetch(`http://localhost:${process.env.PORT}/api/awards/certificate-images/${key}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      return { status: res.status, data: await res.json() };
    };

    const up = await upload('sajal-jain', png, 'image/png', adminToken);
    check('Admin uploads a signature', up.status === 200, JSON.stringify(up.data));
    const fake = await upload('sajal-jain', Buffer.from('not an image at all'), 'image/png', adminToken);
    check('A renamed non-image is rejected', fake.status === 400);
    const empUp = await upload('sajal-jain', png, 'image/png', alexToken);
    check('Employees cannot upload signatures', empUp.status === 403);
    const badSlot = await upload('someone-else', png, 'image/png', adminToken);
    check('Unknown slots are rejected', badSlot.status === 404);

    const after = await makeRequest('/api/awards/certificate-images', 'GET', null, adminToken);
    check(
      'Slot now reads as uploaded',
      after.data.slots.find((s) => s.key === 'sajal-jain')?.source === 'uploaded'
    );
    const preview = await makeRequest('/api/awards/certificate-preview', 'GET', null, adminToken);
    check(
      'Preview certificate draws the uploaded image',
      // The 1x1 test PNG, not a local fallback file (those are far wider).
      preview.status === 200 && /\/Width 1\s/.test(preview.raw?.toString('latin1') || '')
    );
    const cleared = await makeRequest('/api/awards/certificate-images/sajal-jain', 'DELETE', null, adminToken);
    const afterClear = await makeRequest('/api/awards/certificate-images', 'GET', null, adminToken);
    check(
      'Admin can remove an uploaded signature',
      cleared.status === 200 && afterClear.data.slots.find((s) => s.key === 'sajal-jain')?.source !== 'uploaded'
    );

    const removed = await makeRequest(`/api/awards/${awardId}`, 'DELETE', null, adminToken);
    check('Admin can remove an award', removed.status === 200);
  } catch (err) {
    failures += 1;
    console.error('💥 Test crashed:', err);
  }

  console.log(failures === 0 ? '\n🎉 All Employee of the Month tests passed' : `\n⚠️  ${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

runEmployeeOfMonthTest();
