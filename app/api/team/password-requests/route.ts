import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can view password reset requests
  if (role !== "super_admin") {
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
         JOIN users u ON r.user_id = u.id
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
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;
  const currentUserId = request.headers.get("x-user-id") || session?.sub;

  if (!tenantId || !currentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can fulfill/resolve password reset requests
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admin can resolve password reset requests." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { requestId, action, newPassword, adminNotes } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: "Missing requestId or action parameter" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      const reqRes = await client.query(
        `SELECT r.id, r.user_id as "userId", r.status, u.full_name as "fullName", u.email
         FROM password_reset_requests r
         JOIN users u ON r.user_id = u.id
         WHERE r.id = $1 AND r.tenant_id = $2`,
        [requestId, tenantId]
      );

      if (reqRes.rows.length === 0) {
        return NextResponse.json(
          { error: "Password reset request not found" },
          { status: 404 }
        );
      }

      const resetReq = reqRes.rows[0];

      if (action === "resolve") {
        if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
          return NextResponse.json(
            { error: "New password must be at least 6 characters in length." },
            { status: 400 }
          );
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Update target user's password
        await client.query(
          `UPDATE users
           SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL
           WHERE id = $2 AND tenant_id = $3`,
          [passwordHash, resetReq.userId, tenantId]
        );

        // Mark request as resolved
        await client.query(
          `UPDATE password_reset_requests
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, admin_notes = $2
           WHERE id = $3`,
          [currentUserId, adminNotes || null, requestId]
        );

        return NextResponse.json({
          success: true,
          message: `Password for ${resetReq.fullName} has been updated. You can now provide the credentials to the user.`,
        });
      }

      if (action === "reject") {
        await client.query(
          `UPDATE password_reset_requests
           SET status = 'rejected', resolved_at = NOW(), resolved_by = $1, admin_notes = $2
           WHERE id = $3`,
          [currentUserId, adminNotes || null, requestId]
        );

        return NextResponse.json({
          success: true,
          message: `Password reset request for ${resetReq.fullName} has been dismissed.`,
        });
      }

      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    });
  } catch (error) {
    console.error("[PATCH_PASSWORD_REQUESTS_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to process password reset request." },
      { status: 500 }
    );
  }
}
