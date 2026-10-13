import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { sendPasswordResetEmail, sendPasswordResetRequestNotificationEmail } from "@/lib/mail";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, notes } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    return await withClient(async (client) => {
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.email, u.full_name as "fullName",
                u.role, u.is_active as "isActive", o.name as "tenantName"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({
          success: true,
          message: "If this email is registered with Textora Engage, your request has been routed or instructions dispatched.",
        });
      }

      const user = userRes.rows[0];

      if (!user.isActive) {
        return NextResponse.json(
          { error: "This account has been deactivated or suspended by an Administrator. Please reach out to your organization Super Admin." },
          { status: 403 }
        );
      }

      // Role check: Only Level 3 Super Admin can perform self-service password reset
      if (user.role === "super_admin") {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await client.query(
          "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
          [resetToken, resetTokenExpiry, user.id]
        );

        const origin =
          request.headers.get("origin") ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";

        const resetUrl = `${origin}/reset-password?token=${resetToken}`;

        const mailResult = await sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
        });

        return NextResponse.json({
          success: true,
          isSuperAdmin: true,
          message: `Super Admin password reset link has been dispatched to ${user.email}. Please check your inbox.`,
          delivered: mailResult.delivered,
          ...(!mailResult.delivered ? { devPreviewUrl: resetUrl } : {}),
        });
      }

      // Level 1 (sales_rep), Level 2 (sales_manager), and other accounts:
      // Cannot reset password on their own. They raise a request to Level 3 Super Admin!
      const existingReqRes = await client.query(
        `SELECT id, status, requested_at FROM password_reset_requests
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'pending'
         ORDER BY requested_at DESC LIMIT 1`,
        [user.id, user.tenantId]
      );

      let requestId: string;
      if (existingReqRes.rows.length > 0) {
        requestId = existingReqRes.rows[0].id;
        await client.query(
          `UPDATE password_reset_requests
           SET requested_at = NOW(), user_notes = COALESCE($1, user_notes)
           WHERE id = $2`,
          [notes || null, requestId]
        );
      } else {
        const insertRes = await client.query(
          `INSERT INTO password_reset_requests (tenant_id, user_id, status, user_notes)
           VALUES ($1, $2, 'pending', $3)
           RETURNING id`,
          [user.tenantId, user.id, notes || null]
        );
        requestId = insertRes.rows[0].id;
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

      const roleLabel =
        user.role === "sales_manager"
          ? "Level 2 (Sales Manager)"
          : user.role === "sales_rep"
          ? "Level 1 (Sales Representative)"
          : user.role;

      return NextResponse.json({
        success: true,
        isRequestRaised: true,
        requesterRole: user.role,
        message: `Password reset request submitted to your organization's Level 3 Super Admin. Per security policy, ${roleLabel} accounts cannot reset passwords on their own. Please contact your Super Admin to obtain your updated credentials.`,
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
