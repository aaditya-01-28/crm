import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    const targetUser = await prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found in this organization" },
        { status: 404 }
      );
    }

    const updateData: { isActive?: boolean; role?: string } = {};

    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    if (newRole) {
      const allowedRoles = ["sales_rep", "sales_manager", "accounts_ops", "super_admin"];
      if (!allowedRoles.includes(newRole)) {
        return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
      }
      updateData.role = newRole;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: `User ${updatedUser.fullName} updated successfully`,
    });
  } catch (error) {
    console.error("[TEAM_PATCH_USER_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update user access control" },
      { status: 500 }
    );
  }
}
