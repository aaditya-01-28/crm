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

interface SendResetRequestParams {
  adminEmail: string;
  adminName: string;
  requesterName: string;
  requesterEmail: string;
  requesterRole: string;
}

export async function sendPasswordResetRequestNotificationEmail({
  adminEmail,
  adminName,
  requesterName,
  requesterEmail,
  requesterRole,
}: SendResetRequestParams): Promise<{ success: boolean; delivered: boolean }> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "noreply@textorasms.com";

  const roleLabel =
    requesterRole === "sales_manager"
      ? "Level 2 • Sales Manager"
      : requesterRole === "sales_rep"
      ? "Level 1 • Sales Representative"
      : requesterRole;

  console.log("------------------------------------------------------------");
  console.log(`[PASSWORD RESET REQUEST] Requester: ${requesterName} (${requesterEmail}, ${roleLabel})`);
  console.log(`[PASSWORD RESET REQUEST] Organization Admin Notified: ${adminEmail}`);
  console.log("------------------------------------------------------------");

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `"Textora Engage Security" <${from}>`,
        to: adminEmail,
        subject: `🔔 Password Reset Request: ${requesterName} (${roleLabel})`,
        html: `
        <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; color: #1e293b;">
          <div style="max-width: 500px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>
            <p>Hello <strong>${adminName}</strong>,</p>
            <p><strong>${requesterName}</strong> (${roleLabel}) has requested a password reset for their Textora CRM console account.</p>
            <p>As a Level 3 Super Admin, please sign in to your Textora console, navigate to <strong>Team Management</strong>, and set a new password for this user.</p>
            <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 13px;">
              <div><strong>Requester:</strong> ${requesterName}</div>
              <div><strong>Email:</strong> ${requesterEmail}</div>
              <div><strong>Role:</strong> ${roleLabel}</div>
            </div>
          </div>
        </div>
        `,
      });
      return { success: true, delivered: true };
    } catch (err) {
      console.error("[MAIL ERROR] Failed to send admin notification:", err);
      return { success: true, delivered: false };
    }
  }

  return { success: true, delivered: false };
}

interface SendTempPasswordParams {
  to: string;
  fullName: string;
  tempPassword: string;
  loginUrl: string;
}

export async function sendTemporaryPasswordEmail({
  to,
  fullName,
  tempPassword,
  loginUrl,
}: SendTempPasswordParams): Promise<{ success: boolean; delivered: boolean }> {
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
    <title>Your Temporary Textora CRM Password</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="background-color: #0f172a; padding: 24px 32px; border-bottom: 3px solid #10b981; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">
          Textora Engage CRM
        </h1>
        <p style="color: #34d399; margin: 4px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
          Super Admin Security System
        </p>
      </div>
      <div style="padding: 32px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 16px;">
          Temporary Login Password
        </h2>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 16px;">
          Hello <strong>${fullName}</strong>,
        </p>
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
          A password reset was requested for your Level 3 Super Admin account. Use the temporary password below to sign in:
        </p>

        <div style="background-color: #f0fdf4; border: 2px dashed #10b981; padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #065f46; display: block; margin-bottom: 8px; letter-spacing: 0.05em;">
            Your Temporary Password
          </span>
          <div style="font-size: 24px; font-weight: 800; color: #047857; letter-spacing: 2px; font-family: Monaco, Menlo, Consolas, monospace; background: #ffffff; display: inline-block; padding: 8px 24px; border-radius: 8px; border: 1px solid #a7f3d0;">
            ${tempPassword}
          </div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 24px 0;">
          <h4 style="margin: 0 0 8px; font-size: 13px; color: #0f172a; font-weight: 700;">
            Next Steps to Complete Login:
          </h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
            <li>Go to the sign-in page at <a href="${loginUrl}" style="color: #059669; font-weight: 600; text-decoration: none;">${loginUrl}</a>.</li>
            <li>Enter your registered email and the temporary password above.</li>
            <li>You will immediately be prompted to create your new permanent password before accessing the console.</li>
          </ol>
        </div>

        <div style="text-align: center; margin: 28px 0 12px;">
          <a href="${loginUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; font-weight: 600; font-size: 14px; padding: 12px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);">
            Proceed to Sign In
          </a>
        </div>

        <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">
            🔒 If you did not request this password reset, please contact your systems team immediately.
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

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      await transporter.sendMail({
        from: `"Textora Engage Security" <${from}>`,
        to,
        subject: "🔐 Your Temporary Login Password — Textora Engage CRM",
        html: emailHtml,
        text: `Hello ${fullName},\n\nYour temporary password for Textora CRM is: ${tempPassword}\n\nSign in at: ${loginUrl}\nUpon login, you will be prompted to set your new permanent password.`,
      });

      console.log(`[MAIL] Temporary password email dispatched to ${to}`);
      return { success: true, delivered: true };
    } catch (error) {
      console.error("[MAIL ERROR] Failed to send temp password via SMTP:", error);
      console.log(`[MAIL DEV FALLBACK] Temp Password for ${to}: ${tempPassword}`);
      return { success: true, delivered: false };
    }
  }

  console.log("------------------------------------------------------------");
  console.log(`[MAIL DEV MODE] Temporary Password for: ${to} (${fullName})`);
  console.log(`[MAIL DEV MODE] Temp Password: ${tempPassword}`);
  console.log(`[MAIL DEV MODE] Sign In URL: ${loginUrl}`);
  console.log("------------------------------------------------------------");

  return { success: true, delivered: false };
}


