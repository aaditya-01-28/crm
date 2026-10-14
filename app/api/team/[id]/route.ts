import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;
  const currentUserId = request.headers.get("x-user-id") || session?.sub;

  if (!tenantId || !currentUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can manage user access control and reset team passwords
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admin can manage user access and passwords." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { fullName, email, phoneNumber, isActive, role: newRole, newPassword } = body;

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
        "SELECT id, full_name, email, phone_number, role, is_active FROM users WHERE id = $1 AND tenant_id = $2",
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

      let passwordHash: string | null = null;
      if (newPassword) {
        passwordHash = await bcrypt.hash(newPassword, 12);
      }

      const updateRes = await client.query(
        `UPDATE users
         SET is_active = $1,
             role = $2,
             full_name = $3,
             email = $4,
             phone_number = $5,
             password_hash = COALESCE($6, password_hash),
             reset_token = NULL,
             reset_token_expiry = NULL
         WHERE id = $7 AND tenant_id = $8
         RETURNING id, full_name as "fullName", email, phone_number as "phoneNumber",
                   role, language, is_active as "isActive", created_at as "createdAt"`,
        [targetIsActive, targetRole, targetFullName, targetEmail, targetPhone, passwordHash, id, tenantId]
      );

      const updatedUser = updateRes.rows[0];

      // If password was reset, mark any pending password reset requests for this user as resolved
      if (newPassword) {
        await client.query(
          `UPDATE password_reset_requests
           SET status = 'resolved', resolved_at = NOW(), resolved_by = $1
           WHERE user_id = $2 AND tenant_id = $3 AND status = 'pending'`,
          [currentUserId, id, tenantId]
        );
      }

      return NextResponse.json({
        success: true,
        user: updatedUser,
        passwordUpdated: !!newPassword,
        message: newPassword
          ? `Password for ${updatedUser.fullName} has been updated successfully.`
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
