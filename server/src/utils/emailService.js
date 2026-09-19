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

const isConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);

/**
 * Sends via Brevo's transactional email HTTP API instead of raw SMTP.
 *
 * Raw Gmail SMTP (port 587) turned out to be unreliable from Render: its
 * host resolves to both an IPv4 and IPv6 address, Render has no outbound
 * IPv6 route (instant ENETUNREACH on that pick), and even a forced IPv4
 * connection then just hung until timeout — Render's network doesn't
 * reliably carry outbound SMTP at all. Brevo's API runs over plain HTTPS
 * (port 443), which isn't affected by any of that.
 */
const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) return false;

  if (!isConfigured()) {
    if (!warnedNotConfigured) {
      console.warn(
        '✉️  Email not sent — BREVO_API_KEY/EMAIL_FROM are not set in .env. ' +
          'In-app notifications still work; add Brevo credentials to enable email.'
      );
      warnedNotConfigured = true;
    }
    return false;
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'Taggify HRMS', email: process.env.EMAIL_FROM },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html || buildEmailHtml({ subject, text }),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo API ${res.status}: ${body}`);
    }

    return true;
  } catch (err) {
    console.error('✉️  Failed to send notification email:', err.message);
    return false;
  }
};

module.exports = { sendEmail, isConfigured };
