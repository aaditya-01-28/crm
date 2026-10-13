import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

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

  // Only Level 3 Super Admin can manage user access control
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admin can manage user access and permissions." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { isActive, role: newRole } = body;

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

    return await withClient(async (client) => {
      const targetRes = await client.query(
        "SELECT id, role, is_active FROM users WHERE id = $1 AND tenant_id = $2",
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

      const updateRes = await client.query(
        `UPDATE users
         SET is_active = $1, role = $2
         WHERE id = $3 AND tenant_id = $4
         RETURNING id, full_name as "fullName", email, phone_number as "phoneNumber",
                   role, language, is_active as "isActive", created_at as "createdAt"`,
        [targetIsActive, targetRole, id, tenantId]
      );

      const updatedUser = updateRes.rows[0];

      return NextResponse.json({
        success: true,
        user: updatedUser,
        message: `User ${updatedUser.fullName} updated successfully`,
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
