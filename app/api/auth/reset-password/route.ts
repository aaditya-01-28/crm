import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import bcrypt from "bcryptjs";
import {
  checkRateLimit,
  getClientIp,
  hashResetToken,
  validateStrongPassword,
} from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`reset-pw:${ip}`, 10, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many password reset attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || typeof token !== "string" || token.trim().length < 16) {
      return NextResponse.json(
        { error: "Invalid or missing password reset token" },
        { status: 400 }
      );
    }

    const pwCheck = validateStrongPassword(newPassword);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    const tokenHash = hashResetToken(token.trim());

    return await withClient(async (client) => {
      const userRes = await client.query(
        `SELECT u.id, u.role, u.is_active as "isActive",
                COALESCE(o.is_active, true) as "orgIsActive"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.reset_token = $1 AND u.reset_token_expiry > NOW()
         LIMIT 1`,
        [tokenHash]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json(
          { error: "This password reset link is invalid or has expired. Please request a fresh reset link." },
          { status: 400 }
        );
      }

      const user = userRes.rows[0];

      if (!user.isActive || !user.orgIsActive) {
        return NextResponse.json(
          { error: "This account or organization has been deactivated by an Administrator." },
          { status: 403 }
        );
      }

      if (user.role !== "super_admin") {
        return NextResponse.json(
          { error: "Self-service password reset is disabled for Level 1 and Level 2 accounts. Only a Level 3 Super Admin can reset credentials for your account." },
          { status: 403 }
        );
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);

      await client.query(
        `UPDATE users
         SET password_hash = $1,
             reset_token = NULL,
             reset_token_expiry = NULL,
             token_version = COALESCE(token_version, 1) + 1
         WHERE id = $2`,
        [passwordHash, user.id]
      );

      return NextResponse.json({
        success: true,
        message: "Password reset successful! You may now sign in with your new credentials.",
      });
    });
  } catch (error) {
    console.error("[RESET_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}
