import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { sanitizeExternalUrl } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const session = await requireActiveSession(request);
    if (!session?.sub || !session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const currentUserId = session.sub;
    const tenantId = session.tenantId;

    return await withClient(async (client) => {
      const res = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
                u.email, u.phone_number as "phoneNumber", u.role, u.language,
                u.avatar_url as "avatarUrl",
                COALESCE(u.daily_call_target, 60)::int as "dailyCallTarget",
                u.is_active as "isActive", u.created_at as "createdAt",
                o.id as "orgId", o.name as "orgName", o.plan_tier as "orgPlanTier",
                (SELECT COUNT(*)::int FROM leads WHERE assigned_rep_id = u.id AND tenant_id = u.tenant_id) as "assignedLeadsCount",
                (SELECT COUNT(*)::int FROM call_logs WHERE rep_id = u.id AND tenant_id = u.tenant_id) as "callLogsCount",
                (SELECT COUNT(*)::int FROM call_logs WHERE rep_id = u.id AND tenant_id = u.tenant_id AND (duration_seconds > 0 OR disposition ILIKE '%Connected%' OR disposition = 'Contacted')) as "connectedCallsCount",
                (SELECT COUNT(*)::int FROM deals WHERE rep_id = u.id AND tenant_id = u.tenant_id) as "dealsCount"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [currentUserId, tenantId]
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
        avatarUrl: r.avatarUrl || null,
        dailyCallTarget: r.dailyCallTarget ?? 60,
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
          connectedCalls: r.connectedCallsCount,
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
    const session = await requireActiveSession(request);
    if (!session?.sub || !session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const currentUserId = session.sub;
    const tenantId = session.tenantId;

    const body = await request.json();
    const { fullName, phoneNumber, language, avatarUrl, newPassword } = body;

    return await withClient(async (client) => {
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
                u.email, u.phone_number as "phoneNumber", u.role,
                u.language, u.avatar_url as "avatarUrl",
                COALESCE(u.must_change_password, false) as "mustChangePassword",
                COALESCE(u.token_version, 1)::int as "tokenVersion",
                u.previous_login_at as "previousLoginAt",
                u.last_login_at as "lastLoginAt",
                o.id as "orgId", o.name as "orgName", o.plan_tier as "orgPlanTier"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [currentUserId, tenantId]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const existingUser = userRes.rows[0];

      let updatedFullName = existingUser.fullName;
      if (fullName !== undefined) {
        const trimmed = String(fullName).trim();
        if (!trimmed || trimmed.length < 2) {
          return NextResponse.json(
            { error: "Full name must be at least 2 characters" },
            { status: 400 }
          );
        }
        updatedFullName = trimmed;
      }

      let updatedPhoneNumber = existingUser.phoneNumber ?? null;
      if (phoneNumber !== undefined) {
        // Only Level 3 Super Admin can update phone number; other roles preserve existing phone number
        if (isAdmin(existingUser.role)) {
          updatedPhoneNumber = phoneNumber ? String(phoneNumber).trim() : null;
        }
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

      let updatedAvatarUrl = existingUser.avatarUrl;
      if (avatarUrl !== undefined) {
        if (avatarUrl === null || String(avatarUrl).trim() === "") {
          updatedAvatarUrl = null;
        } else {
          const safeAvatar = sanitizeExternalUrl(avatarUrl, { allowRelative: true });
          if (!safeAvatar) {
            return NextResponse.json(
              { error: "Invalid avatar URL (must use http://, https://, or a safe relative path)" },
              { status: 400 }
            );
          }
          updatedAvatarUrl = safeAvatar;
        }
      }

      if (newPassword) {
        return NextResponse.json(
          { error: "Password changes from user profile are disabled. Please contact your Level 3 Super Admin to manage credentials." },
          { status: 403 }
        );
      }

      const updateRes = await client.query(
        `UPDATE users
         SET full_name = $1, phone_number = $2, language = $3, avatar_url = $4
         WHERE id = $5 AND tenant_id = $6
         RETURNING id, tenant_id as "tenantId", full_name as "fullName",
                   email, phone_number as "phoneNumber", role, language,
                   avatar_url as "avatarUrl",
                   is_active as "isActive", created_at as "createdAt"`,
        [updatedFullName, updatedPhoneNumber, updatedLanguage, updatedAvatarUrl, currentUserId, tenantId]
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
        avatarUrl: updatedUser.avatarUrl && updatedUser.avatarUrl.length < 500 ? updatedUser.avatarUrl : null,
        mustChangePassword: Boolean(existingUser.mustChangePassword),
        tokenVersion: Number(existingUser.tokenVersion ?? 1),
        lastLoginAt: existingUser.previousLoginAt
          ? new Date(existingUser.previousLoginAt).toISOString()
          : (session.lastLoginAt || null),
        loginAt: existingUser.lastLoginAt
          ? new Date(existingUser.lastLoginAt).toISOString()
          : (session.loginAt || new Date().toISOString()),
        phoneNumber: updatedUser.phoneNumber || null,
      };

      const accessToken = await signAccessToken(jwtPayload);
      const refreshToken = await signRefreshToken(jwtPayload);

      const response = NextResponse.json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser,
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
