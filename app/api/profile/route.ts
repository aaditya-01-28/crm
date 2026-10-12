import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const headerUserId = request.headers.get("x-user-id");
    const currentUserId = headerUserId || session?.sub;

    if (!currentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            planTier: true,
          },
        },
        _count: {
          select: {
            assignedLeads: true,
            callLogs: true,
            deals: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[PROFILE_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to fetch profile details" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    const headerUserId = request.headers.get("x-user-id");
    const currentUserId = headerUserId || session?.sub;

    if (!currentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { fullName, phoneNumber, language, currentPassword, newPassword } = body;

    const existingUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      include: { tenant: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: {
      fullName?: string;
      phoneNumber?: string | null;
      language?: string;
      passwordHash?: string;
    } = {};

    // 1. Update Full Name
    if (fullName !== undefined) {
      const trimmed = fullName.trim();
      if (!trimmed || trimmed.length < 2) {
        return NextResponse.json(
          { error: "Full name must be at least 2 characters" },
          { status: 400 }
        );
      }
      updateData.fullName = trimmed;
    }

    // 2. Update Phone Number
    if (phoneNumber !== undefined) {
      updateData.phoneNumber = phoneNumber ? phoneNumber.trim() : null;
    }

    // 3. Update Language Preference
    if (language !== undefined) {
      const langTrimmed = language.trim().toLowerCase();
      if (langTrimmed) {
        updateData.language = langTrimmed;
      }
    }

    // 4. Update Password (if requested)
    let passwordUpdated = false;
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to set a new password" },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "New password must be at least 6 characters" },
          { status: 400 }
        );
      }

      const isCurrentValid = await bcrypt.compare(
        currentPassword,
        existingUser.passwordHash
      );

      if (!isCurrentValid) {
        return NextResponse.json(
          { error: "Current password does not match. Please verify and try again." },
          { status: 400 }
        );
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      updateData.passwordHash = newHash;
      passwordUpdated = true;
    }

    // Perform database update
    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: updateData,
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            planTier: true,
          },
        },
      },
    });

    // If full name changed, re-issue new JWT cookies so active session is immediately updated
    const jwtPayload = {
      sub: updatedUser.id,
      tenantId: updatedUser.tenantId,
      role: updatedUser.role,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
    };

    const accessToken = await signAccessToken(jwtPayload);
    const refreshToken = await signRefreshToken(jwtPayload);

    const response = NextResponse.json({
      success: true,
      message: passwordUpdated
        ? "Profile & password updated successfully"
        : "Profile updated successfully",
      user: updatedUser,
      passwordUpdated,
    });

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("[PROFILE_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update profile settings" },
      { status: 500 }
    );
  }
}
