const nodemailer = require('nodemailer');
const dns = require('dns').promises;

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

let warnedNotConfigured = false;

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/**
 * nodemailer resolves both A and AAAA records for the SMTP host and picks
 * one at random to connect to (see its shared/resolveHostname). On hosts
 * with no outbound IPv6 route (e.g. Render), every AAAA pick fails with
 * ENETUNREACH — so mail only got through on the ~1-in-N tries that happened
 * to land on an IPv4 address.
 *
 * Resolving the A record ourselves and connecting to that literal IP makes
 * nodemailer skip its own dual-stack resolution entirely (it only resolves
 * hostnames, not IPs). `servername` is set explicitly so TLS still validates
 * the certificate against the real hostname instead of the bare IP.
 * Re-resolved on every send rather than cached, since a fresh transporter
 * per send costs one extra DNS lookup but stays correct if Gmail's IP ever
 * changes — cheaper than debugging a stale-IP failure months from now.
 */
const buildTransporter = async () => {
  const host = process.env.SMTP_HOST;
  let connectHost = host;
  try {
    const addresses = await dns.resolve4(host);
    if (addresses?.[0]) connectHost = addresses[0];
  } catch (err) {
    console.warn(`✉️  Could not resolve ${host} to an IPv4 address, falling back to hostname:`, err.message);
  }

  return nodemailer.createTransport({
    host: connectHost,
    servername: host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
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
    const transporter = await buildTransporter();
    await transporter.sendMail({
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
