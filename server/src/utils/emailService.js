const nodemailer = require('nodemailer');

// Email clients don't run Tailwind/external CSS, so this is a plain
// inline-styled table layout — the safest thing that renders consistently
// across Gmail, Outlook, and mobile mail apps.
const buildEmailHtml = ({ subject, text }) => `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:24px; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e2e8f0;">
      <tr>
        <td style="background-color:#f97316; padding:20px 28px;">
          <span style="font-size:16px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">Taggify HRMS</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 12px; font-size:18px; font-weight:700; color:#0f172a;">${subject}</h1>
          <p style="margin:0; font-size:14px; line-height:1.6; color:#334155;">${text}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
          <p style="margin:0; font-size:12px; color:#94a3b8;">
            This is an automated notification from Taggify HRMS. Please do not reply to this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

let transporter = null;
let warnedNotConfigured = false;

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Some hosts (e.g. Render) have no outbound IPv6 route, but Gmail's SMTP
    // hostname resolves to an IPv6 address first — that attempt fails with
    // ENETUNREACH before ever falling back to IPv4. Forcing IPv4 here skips
    // the broken path entirely.
    family: 4,
  });
  return transporter;
};

/**
 * Sends a notification email. Never throws — a misconfigured or unreachable
 * SMTP server must not break the request that triggered the notification.
 * Until SMTP_HOST/SMTP_USER/SMTP_PASS are set in .env, this is a no-op that
 * logs a single warning so the gap is visible without spamming the console.
 */
const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) return false;

  if (!isConfigured()) {
    if (!warnedNotConfigured) {
      console.warn(
        '✉️  Email not sent — SMTP_HOST/SMTP_USER/SMTP_PASS are not set in .env. ' +
          'In-app notifications still work; add SMTP credentials to enable email.'
      );
      warnedNotConfigured = true;
    }
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: html || buildEmailHtml({ subject, text }),
    });
    return true;
  } catch (err) {
    console.error('✉️  Failed to send notification email:', err.message);
    return false;
  }
};

module.exports = { sendEmail, isConfigured };
