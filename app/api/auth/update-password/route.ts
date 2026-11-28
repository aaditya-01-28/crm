import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import { withClient, queryUserByEmail } from "@/lib/db";
import bcrypt from "bcryptjs";
import { checkRateLimit, getClientIp, validateStrongPassword } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`update-pw:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many password update attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { newPassword, email, temporaryPassword } = body;

    const pwCheck = validateStrongPassword(newPassword);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    let targetUserId: string | null = null;
    let targetTenantId: string | null = null;

    // Check if authenticated via active session
    const session = await requireActiveSession(request);
    if (session) {
      targetUserId = session.sub;
      targetTenantId = session.tenantId;
    } else if (typeof email === "string" && typeof temporaryPassword === "string" && email.trim() && temporaryPassword) {
      // Unauthenticated temporary-password upgrade is strictly limited to active accounts in forced mustChangePassword state
      const user = await queryUserByEmail(email.trim());
      if (user) {
        if (!user.isActive || !user.orgIsActive) {
          return NextResponse.json(
            { error: "This account or organization has been suspended." },
            { status: 403 }
          );
        }
        if (!user.mustChangePassword) {
          return NextResponse.json(
            { error: "Please sign in normally before updating your password." },
            { status: 401 }
          );
        }
        const valid = await bcrypt.compare(temporaryPassword, user.passwordHash);
        if (valid) {
          targetUserId = user.id;
          targetTenantId = user.tenantId;
        }
      }
    }

    if (!targetUserId || !targetTenantId) {
      return NextResponse.json(
        { error: "Session expired or invalid credentials. Please sign in again with your temporary password." },
        { status: 401 }
      );
    }

    return await withClient(async (client) => {
      const passwordHash = await bcrypt.hash(newPassword, 12);

      const updateRes = await client.query(
        `UPDATE users
         SET password_hash = $1,
             must_change_password = false,
             reset_token = NULL,
             reset_token_expiry = NULL,
             token_version = COALESCE(token_version, 1) + 1
         WHERE id = $2 AND tenant_id = $3 AND is_active = true
         RETURNING id, tenant_id as "tenantId", email, full_name as "fullName", role,
                   avatar_url as "avatarUrl", phone_number as "phoneNumber",
                   last_login_at as "lastLoginAt",
                   COALESCE(token_version, 1)::int as "tokenVersion"`,
        [passwordHash, targetUserId, targetTenantId]
      );

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
      }

      const updated = updateRes.rows[0];
      const now = new Date().toISOString();

      // Sign fresh tokens with updated tokenVersion and mustChangePassword: false
      const jwtPayload = {
        sub: updated.id,
        tenantId: updated.tenantId,
        role: updated.role,
        email: updated.email,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl && updated.avatarUrl.length < 500 ? updated.avatarUrl : null,
        mustChangePassword: false,
        tokenVersion: updated.tokenVersion,
        lastLoginAt: updated.lastLoginAt ? new Date(updated.lastLoginAt).toISOString() : now,
        loginAt: now,
        phoneNumber: updated.phoneNumber || null,
      };

      const accessToken = await signAccessToken(jwtPayload);
      const refreshToken = await signRefreshToken(jwtPayload);

      const response = NextResponse.json({
        success: true,
        message: "Permanent password updated successfully! Welcome to Textora Engage.",
        user: {
          id: updated.id,
          fullName: updated.fullName,
          email: updated.email,
          role: updated.role,
          mustChangePassword: false,
        },
      });

      setAuthCookies(response, accessToken, refreshToken);
      return response;
    });
  } catch (error) {
    console.error("[UPDATE_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { error: "An error occurred while setting your new password. Please try again." },
      { status: 500 }
    );
  }
}
