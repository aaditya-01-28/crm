import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { sendPasswordResetRequestNotificationEmail, sendPasswordResetEmail } from "@/lib/mail";
import crypto from "crypto";
import {
  checkRateLimit,
  getClientIp,
  getTrustedAppBaseUrl,
  hashResetToken,
} from "@/lib/security";

const UNIFORM_FORGOT_PASSWORD_MESSAGE =
  "If an active account exists for this email, password reset instructions have been emailed (for Super Admins) or a reset request has been sent to your organization administrator.";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`forgot-pw:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { email, notes } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    return await withClient(async (client) => {
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.email, u.full_name as "fullName",
                u.role, u.is_active as "isActive", o.name as "tenantName",
                COALESCE(o.is_active, true) as "orgIsActive"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({
          success: true,
          message: UNIFORM_FORGOT_PASSWORD_MESSAGE,
        });
      }

      const user = userRes.rows[0];

      // Return uniform 200 response for inactive users/orgs as well to prevent user/status enumeration
      if (!user.isActive || !user.orgIsActive) {
        return NextResponse.json({
          success: true,
          message: UNIFORM_FORGOT_PASSWORD_MESSAGE,
        });
      }

      // Role check: Level 3 Super Admin receives a secure single-use reset link on their email
      if (user.role === "super_admin") {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashResetToken(resetToken);

        await client.query(
          `UPDATE users
           SET reset_token = $1,
               reset_token_expiry = NOW() + INTERVAL '1 hour'
           WHERE id = $2`,
          [tokenHash, user.id]
        );

        const baseUrl = getTrustedAppBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

        await sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
        });

        return NextResponse.json({
          success: true,
          message: UNIFORM_FORGOT_PASSWORD_MESSAGE,
        });
      }

      // Level 1 (sales_rep), Level 2 (sales_manager), and other accounts:
      // Cannot reset password on their own. They raise a request to Level 3 Super Admin!
      const cleanNotes = typeof notes === "string" ? notes.trim().slice(0, 500) || null : null;
      const existingReqRes = await client.query(
        `SELECT id, status, requested_at FROM password_reset_requests
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
        [user.id, user.tenantId]
      );

      if (existingReqRes.rows.length > 0) {
        await client.query(
          `UPDATE password_reset_requests
           SET requested_at = NOW(), user_notes = COALESCE($1, user_notes)
           WHERE id = $2`,
          [cleanNotes, existingReqRes.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO password_reset_requests (tenant_id, user_id, status, user_notes)
           VALUES ($1, $2, 'pending', $3)`,
          [user.tenantId, user.id, cleanNotes]
        );
      }

      // Notify Super Admins in this tenant
      const adminsRes = await client.query(
        `SELECT email, full_name as "fullName" FROM users
         WHERE tenant_id = $1 AND role = 'super_admin' AND is_active = true`,
        [user.tenantId]
      );

      for (const admin of adminsRes.rows) {
        sendPasswordResetRequestNotificationEmail({
          adminEmail: admin.email,
          adminName: admin.fullName,
          requesterName: user.fullName,
          requesterEmail: user.email,
          requesterRole: user.role,
        }).catch((err) => console.error("[ADMIN_NOTIFY_ERROR]", err));
      }

      return NextResponse.json({
        success: true,
        message: UNIFORM_FORGOT_PASSWORD_MESSAGE,
      });
    });
  } catch (error) {
    console.error("[FORGOT_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { error: "An error occurred while processing your password reset request. Please try again." },
      { status: 500 }
    );
  }
}
