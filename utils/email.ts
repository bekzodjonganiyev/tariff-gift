import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP-backed e-mail helper.
 *
 * Reads the standard `SMTP_*` env vars (see `.env.local`):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *
 * Install the dependency once:  `npm install nodemailer && npm install -D @types/nodemailer`
 */

let transporter: Transporter | null = null;

/**
 * Lazily build (and memoise) the transport. nodemailer pools the underlying
 * connections, so a single transport per server instance is correct and cheap.
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.",
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587/25 upgrade via STARTTLS.
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/** Minimal HTML-escaping so user-controlled values can't break the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send the activation-code e-mail after a gift application is approved.
 *
 * Resolves on success and throws on transport failure, so callers can decide
 * whether to retry or surface the error.
 */
export async function sendActivationCodeEmail(
  userEmail: string,
  activationCode: string,
  period: string,
): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
  const safeCode = escapeHtml(activationCode);
  const safePeriod = escapeHtml(period);

  const html = `
  <!DOCTYPE html>
  <html lang="en">
    <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
              <tr>
                <td style="background:#111827;padding:28px 32px;">
                  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">🎁 Your gift is activated</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                    Good news — your application has been approved. Use the activation code below to redeem your
                    <strong>${safePeriod}</strong> subscription.
                  </p>
                  <div style="margin:24px 0;padding:18px;background:#f3f4f6;border:1px dashed #d1d5db;border-radius:8px;text-align:center;">
                    <span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:#111827;">${safeCode}</span>
                  </div>
                  <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                    Keep this code private. If you didn't request this, you can safely ignore this e-mail.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #f0f0f0;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">This is an automated message — please do not reply.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  await getTransporter().sendMail({
    from,
    to: userEmail,
    subject: "Your activation code is ready 🎁",
    text: `Your application was approved. Activation code: ${activationCode} (valid for the ${period} plan).`,
    html,
  });
}
