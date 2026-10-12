import nodemailer from "nodemailer";

interface SendResetEmailParams {
  to: string;
  fullName: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  fullName,
  resetUrl,
}: SendResetEmailParams): Promise<{ success: boolean; delivered: boolean; resetUrl?: string }> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "noreply@textorasms.com";

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Textora CRM Password</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #10b981; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">
          Textora Engage CRM
        </h1>
        <p style="color: #34d399; margin: 4px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
          Enterprise Authentication System
        </p>
      </div>
      <div style="padding: 32px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 16px;">
          Password Reset Request
        </h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px;">
          Hello <strong>${fullName}</strong>,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px;">
          We received a request to reset your password for your <strong>Textora Engage</strong> console account. Click the button below to choose a new secure password:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);">
            Reset Password
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 24px 0 8px;">
          Or copy and paste this link in your browser:
        </p>
        <div style="background-color: #f1f5f9; padding: 10px 14px; border-radius: 8px; word-break: break-all; font-size: 12px; color: #0284c7; font-family: monospace;">
          ${resetUrl}
        </div>
        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">
            ⏳ This link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email. Your account remains completely secure.
          </p>
        </div>
      </div>
      <div style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        © Textora Technologies Pvt Ltd · Enterprise Communication & CRM Infrastructure
      </div>
    </div>
  </body>
  </html>
  `;

  // If SMTP is configured, attempt sending live email
  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `"Textora Engage" <${from}>`,
        to,
        subject: "🔒 Reset Your Textora CRM Password",
        html: emailHtml,
        text: `Hello ${fullName},\n\nReset your Textora CRM password by clicking this link:\n${resetUrl}\n\nThis link is valid for 1 hour. If you didn't request this, ignore this email.`,
      });

      console.log(`[MAIL] Password reset email successfully dispatched to ${to}`);
      return { success: true, delivered: true, resetUrl };
    } catch (error) {
      console.error("[MAIL ERROR] Failed to send email via SMTP:", error);
      // Fallback: still log the link for dev/testing
      console.log(`[MAIL DEV FALLBACK] Password Reset URL for ${to}: ${resetUrl}`);
      return { success: true, delivered: false, resetUrl };
    }
  }

  // Local development / mock mode when SMTP credentials are not yet entered
  console.log("------------------------------------------------------------");
  console.log(`[MAIL DEV MODE] Password Reset Requested for: ${to} (${fullName})`);
  console.log(`[MAIL DEV MODE] Reset URL: ${resetUrl}`);
  console.log("------------------------------------------------------------");

  return { success: true, delivered: false, resetUrl };
}
