import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendTemporaryPasswordEmail } from "@/lib/mail";
import bcrypt from "bcryptjs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;
  const role = session.role;
  const currentUserId = session.sub;

  // Level 3 Super Admin can manage all user fields; Level 2 Sales Manager can update dailyCallTarget
  if (!["super_admin", "sales_manager"].includes(role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 2 Sales Managers and Level 3 Super Admins can manage team targets." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { fullName, email, phoneNumber, isActive, role: newRole, newPassword, dailyCallTarget } = body;

    if (role === "sales_manager") {
      const hasRestrictedFields =
        fullName !== undefined ||
        email !== undefined ||
        phoneNumber !== undefined ||
        isActive !== undefined ||
        newRole !== undefined ||
        newPassword !== undefined;
      if (hasRestrictedFields) {
        return NextResponse.json(
          { error: "Forbidden: Level 2 Sales Managers can only update daily calling targets." },
          { status: 403 }
        );
      }
    }

    // Guard: Prevent Super Admin from blocking or demoting their own active account
    if (id === currentUserId) {
      if (isActive === false) {
        return NextResponse.json(
          { error: "You cannot block or deactivate your own Super Admin account." },
          { status: 400 }
        );
      }
      if (newRole && newRole !== "super_admin") {
        return NextResponse.json(
          { error: "You cannot remove Super Admin role from your own active session." },
          { status: 400 }
        );
      }
    }

    if (newPassword !== undefined && newPassword !== "") {
      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return NextResponse.json(
          { error: "New password must be at least 6 characters in length." },
          { status: 400 }
        );
      }
    }

    return await withClient(async (client) => {
      const targetRes = await client.query(
        "SELECT id, full_name, email, phone_number, role, is_active, COALESCE(daily_call_target, 60) as daily_call_target FROM users WHERE id = $1 AND tenant_id = $2",
        [id, tenantId]
      );

      if (targetRes.rows.length === 0) {
        return NextResponse.json(
          { error: "User not found in this organization" },
          { status: 404 }
        );
      }

      const existing = targetRes.rows[0];
      const targetIsActive = typeof isActive === "boolean" ? isActive : existing.is_active;

      let targetRole = existing.role;
      if (newRole) {
        const allowedRoles = ["sales_rep", "sales_manager", "accounts_ops", "super_admin"];
        if (!allowedRoles.includes(newRole)) {
          return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
        }
        targetRole = newRole;
      }

      let targetFullName = existing.full_name;
      if (fullName !== undefined) {
        const trimmed = String(fullName).trim();
        if (!trimmed || trimmed.length < 2) {
          return NextResponse.json(
            { error: "Full name must be at least 2 characters in length." },
            { status: 400 }
          );
        }
        targetFullName = trimmed;
      }

      let targetEmail = existing.email;
      if (email !== undefined) {
        const cleanEmail = String(email).toLowerCase().trim();
        if (!cleanEmail || !cleanEmail.includes("@")) {
          return NextResponse.json(
            { error: "A valid email address is required." },
            { status: 400 }
          );
        }

        if (cleanEmail !== existing.email.toLowerCase().trim()) {
          const emailCheck = await client.query(
            "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1",
            [cleanEmail, id]
          );
          if (emailCheck.rows.length > 0) {
            return NextResponse.json(
              { error: `The email ${cleanEmail} is already registered to another user account.` },
              { status: 400 }
            );
          }
        }
        targetEmail = cleanEmail;
      }

      let targetPhone = existing.phone_number;
      if (phoneNumber !== undefined) {
        targetPhone = phoneNumber ? String(phoneNumber).trim() : null;
      }

      let targetDailyCallTarget = existing.daily_call_target ?? 60;
      if (dailyCallTarget !== undefined) {
        const parsedTarget = Number(dailyCallTarget);
        if (!Number.isFinite(parsedTarget) || parsedTarget < 1 || parsedTarget > 1000) {
          return NextResponse.json(
            { error: "Daily calling target must be between 1 and 1000 calls/day." },
            { status: 400 }
          );
        }
        targetDailyCallTarget = Math.round(parsedTarget);
      }

      let passwordHash: string | null = null;
      if (newPassword) {
        passwordHash = await bcrypt.hash(newPassword, 12);
      }

      await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;").catch(() => {});
      await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_call_target INTEGER DEFAULT 60;").catch(() => {});

      const updateRes = await client.query(
        `UPDATE users
         SET is_active = $1,
             role = $2,
             full_name = $3,
             email = $4,
             phone_number = $5,
             daily_call_target = $6,
             password_hash = COALESCE($7, password_hash),
             must_change_password = CASE WHEN $7 IS NOT NULL THEN true ELSE must_change_password END,
             reset_token = NULL,
             reset_token_expiry = NULL
         WHERE id = $8 AND tenant_id = $9
         RETURNING id, full_name as "fullName", email, phone_number as "phoneNumber",
                   role, language, COALESCE(daily_call_target, 60)::int as "dailyCallTarget",
                   is_active as "isActive", created_at as "createdAt"`,
        [targetIsActive, targetRole, targetFullName, targetEmail, targetPhone, targetDailyCallTarget, passwordHash, id, tenantId]
      );

      const updatedUser = updateRes.rows[0];

      // If password was reset, mark any pending password reset requests for this user as resolved
      let emailDelivered = false;
      if (newPassword) {
        await client.query(
          `UPDATE password_reset_requests
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
           WHERE user_id = $2 AND tenant_id = $3 AND status = 'pending'`,
          [currentUserId, id, tenantId]
        );

        const origin =
          request.headers.get("origin") ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "https://crm.textorasms.com";
        const loginUrl = `${origin}/login`;

        try {
          const mailResult = await sendTemporaryPasswordEmail({
            to: targetEmail,
            fullName: targetFullName,
            tempPassword: newPassword,
            loginUrl,
          });
          emailDelivered = mailResult.delivered;
        } catch (err) {
          console.error("[TEAM_PATCH_USER_EMAIL_ERROR]", err);
        }
      }

      return NextResponse.json({
        success: true,
        user: updatedUser,
        passwordUpdated: !!newPassword,
        emailDelivered,
        message: newPassword
          ? `Temporary password assigned and sent to ${targetEmail}. User will create their permanent password upon first login.`
          : `User ${updatedUser.fullName} updated successfully.`,
      });
    });
  } catch (error) {
    console.error("[TEAM_PATCH_USER_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update user access control" },
      { status: 500 }
    );
  }
}
