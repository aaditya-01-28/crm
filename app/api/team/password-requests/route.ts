import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { getTrustedAppBaseUrl, isValidUuid, validateStrongPassword } from "@/lib/security";
import { sendTemporaryPasswordEmail } from "@/lib/mail";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;

  // Only Level 3 Super Admin can view password reset requests
  if (!isAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admin can view password reset requests." },
      { status: 403 }
    );
  }

  try {
    return await withClient(async (client) => {
      const requestsRes = await client.query(
        `SELECT r.id, r.user_id as "userId", r.status,
                r.requested_at as "requestedAt", r.resolved_at as "resolvedAt",
                r.user_notes as "userNotes", r.admin_notes as "adminNotes",
                u.full_name as "fullName", u.email, u.role, u.phone_number as "phoneNumber",
                u.is_active as "isActive"
         FROM password_reset_requests r
         JOIN users u ON r.user_id = u.id AND u.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1
         ORDER BY (CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END), r.requested_at DESC
         LIMIT 100`,
        [tenantId]
      );

      const pendingCount = requestsRes.rows.filter((r) => r.status === "pending").length;

      return NextResponse.json({
        requests: requestsRes.rows,
        pendingCount,
      });
    });
  } catch (error) {
    console.error("[GET_PASSWORD_REQUESTS_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to load password reset requests." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const role = session.role;
  const currentUserId = session.sub;

  // Only Level 3 Super Admin can fulfill/resolve password reset requests
  if (!isAdmin(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admin can resolve password reset requests." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { requestId, action, newPassword, adminNotes } = body;

    if (!isValidUuid(requestId) || !action) {
      return NextResponse.json(
        { error: "Valid requestId and action parameter are required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const reqRes = await client.query(
          `SELECT r.id, r.user_id as "userId", r.status, u.full_name as "fullName", u.email
           FROM password_reset_requests r
           JOIN users u ON r.user_id = u.id AND u.tenant_id = r.tenant_id
           WHERE r.id = $1 AND r.tenant_id = $2 FOR UPDATE`,
          [requestId, tenantId]
        );

        if (reqRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Password reset request not found" },
            { status: 404 }
          );
        }

        const resetReq = reqRes.rows[0];

        if (action === "resolve") {
          const pwCheck = validateStrongPassword(newPassword);
          if (!pwCheck.valid) {
            await client.query("ROLLBACK");
            return NextResponse.json({ error: pwCheck.error }, { status: 400 });
          }

          const passwordHash = await bcrypt.hash(newPassword, 12);

          // Update target user's password, invalidate existing tokens, and require password change on first login
          await client.query(
            `UPDATE users
             SET password_hash = $1,
                 must_change_password = true,
                 reset_token = NULL,
                 reset_token_expiry = NULL,
                 token_version = COALESCE(token_version, 1) + 1
             WHERE id = $2 AND tenant_id = $3`,
            [passwordHash, resetReq.userId, tenantId]
          );

          // Mark request as resolved
          await client.query(
            `UPDATE password_reset_requests
             SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, admin_notes = $2
             WHERE id = $3 AND tenant_id = $4`,
            [currentUserId, adminNotes || null, requestId, tenantId]
          );

          await client.query("COMMIT");

          const loginUrl = `${getTrustedAppBaseUrl()}/login`;

          let emailDelivered = false;
          try {
            const mailResult = await sendTemporaryPasswordEmail({
              to: resetReq.email,
              fullName: resetReq.fullName,
              tempPassword: newPassword,
              loginUrl,
            });
            emailDelivered = mailResult.delivered;
          } catch (err) {
            console.error("[PASSWORD_REQUEST_EMAIL_ERROR]", err);
          }

          return NextResponse.json({
            success: true,
            emailDelivered,
            message: `Temporary password assigned and sent to ${resetReq.email}. User will create their permanent password on next login.`,
          });
        }

        if (action === "reject") {
          await client.query(
            `UPDATE password_reset_requests
             SET status = 'rejected', resolved_at = NOW(), resolved_by = $1, admin_notes = $2
             WHERE id = $3 AND tenant_id = $4`,
            [currentUserId, adminNotes || null, requestId, tenantId]
          );

          await client.query("COMMIT");

          return NextResponse.json({
            success: true,
            message: `Password reset request for ${resetReq.fullName} has been dismissed.`,
          });
        }

        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[PATCH_PASSWORD_REQUESTS_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to process password reset request." },
      { status: 500 }
    );
  }
}
