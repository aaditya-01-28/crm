import { NextRequest, NextResponse } from "next/server";
import { getSession, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import { withClient, queryUserByEmail } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newPassword, email, temporaryPassword } = body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters in length." },
        { status: 400 }
      );
    }

    let targetUserId: string | null = null;

    // Check if authenticated via session
    const session = await getSession();
    if (session) {
      targetUserId = session.sub;
    } else if (email && temporaryPassword) {
      // Validate temporary credentials directly if session cookie is not present
      const user = await queryUserByEmail(email.trim());
      if (user) {
        const valid = await bcrypt.compare(temporaryPassword, user.passwordHash);
        if (valid) {
          targetUserId = user.id;
        }
      }
    }

    if (!targetUserId) {
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
             reset_token_expiry = NULL
         WHERE id = $2
         RETURNING id, tenant_id as "tenantId", email, full_name as "fullName", role, avatar_url as "avatarUrl"`,
        [passwordHash, targetUserId]
      );

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const updated = updateRes.rows[0];

      // Sign fresh tokens with mustChangePassword: false
      const jwtPayload = {
        sub: updated.id,
        tenantId: updated.tenantId,
        role: updated.role,
        email: updated.email,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl && updated.avatarUrl.length < 500 ? updated.avatarUrl : null,
        mustChangePassword: false,
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
