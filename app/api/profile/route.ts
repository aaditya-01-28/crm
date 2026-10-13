import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
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

    return await withClient(async (client) => {
      const res = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
                u.email, u.phone_number as "phoneNumber", u.role, u.language,
                u.is_active as "isActive", u.created_at as "createdAt",
                o.id as "orgId", o.name as "orgName", o.plan_tier as "orgPlanTier",
                (SELECT COUNT(*)::int FROM leads WHERE assigned_rep_id = u.id) as "assignedLeadsCount",
                (SELECT COUNT(*)::int FROM call_logs WHERE rep_id = u.id) as "callLogsCount",
                (SELECT COUNT(*)::int FROM deals WHERE rep_id = u.id) as "dealsCount"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.id = $1
         LIMIT 1`,
        [currentUserId]
      );

      if (res.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const r = res.rows[0];
      const user = {
        id: r.id,
        tenantId: r.tenantId,
        fullName: r.fullName,
        email: r.email,
        phoneNumber: r.phoneNumber,
        role: r.role,
        language: r.language,
        isActive: r.isActive,
        createdAt: r.createdAt,
        tenant: {
          id: r.orgId,
          name: r.orgName,
          planTier: r.orgPlanTier,
        },
        _count: {
          assignedLeads: r.assignedLeadsCount,
          callLogs: r.callLogsCount,
          deals: r.dealsCount,
        },
      };

      return NextResponse.json({ user });
    });
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

    return await withClient(async (client) => {
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
                u.email, u.password_hash as "passwordHash", u.role,
                o.id as "orgId", o.name as "orgName", o.plan_tier as "orgPlanTier"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.id = $1
         LIMIT 1`,
        [currentUserId]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const existingUser = userRes.rows[0];

      let updatedFullName = existingUser.fullName;
      if (fullName !== undefined) {
        const trimmed = fullName.trim();
        if (!trimmed || trimmed.length < 2) {
          return NextResponse.json(
            { error: "Full name must be at least 2 characters" },
            { status: 400 }
          );
        }
        updatedFullName = trimmed;
      }

      let updatedPhoneNumber = existingUser.phoneNumber;
      if (phoneNumber !== undefined) {
        updatedPhoneNumber = phoneNumber ? phoneNumber.trim() : null;
      }

      let updatedLanguage = existingUser.language || "en";
      if (language !== undefined) {
        if (Array.isArray(language)) {
          const joined = language.map((l: string) => String(l).trim().toLowerCase()).filter(Boolean).join(",");
          updatedLanguage = joined || "en";
        } else if (typeof language === "string") {
          const cleaned = language
            .split(",")
            .map((l) => l.trim().toLowerCase())
            .filter(Boolean)
            .join(",");
          updatedLanguage = cleaned || "en";
        }
      }

      let passwordUpdated = false;
      let newHash = existingUser.passwordHash;
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

        newHash = await bcrypt.hash(newPassword, 10);
        passwordUpdated = true;
      }

      const updateRes = await client.query(
        `UPDATE users
         SET full_name = $1, phone_number = $2, language = $3, password_hash = $4
         WHERE id = $5
         RETURNING id, tenant_id as "tenantId", full_name as "fullName",
                   email, phone_number as "phoneNumber", role, language,
                   is_active as "isActive", created_at as "createdAt"`,
        [updatedFullName, updatedPhoneNumber, updatedLanguage, newHash, currentUserId]
      );

      const r = updateRes.rows[0];
      const updatedUser = {
        ...r,
        tenant: {
          id: existingUser.orgId,
          name: existingUser.orgName,
          planTier: existingUser.orgPlanTier,
        },
      };

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
    });
  } catch (error) {
    console.error("[PROFILE_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to update profile settings" },
      { status: 500 }
    );
  }
}
