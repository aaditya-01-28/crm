import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing password reset token" },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters in length" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      const userRes = await client.query(
        "SELECT id, role, is_active as \"isActive\" FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW() LIMIT 1",
        [token]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json(
          { error: "This password reset link is invalid or has expired. Please request a fresh reset link." },
          { status: 400 }
        );
      }

      const user = userRes.rows[0];

      if (!user.isActive) {
        return NextResponse.json(
          { error: "This account has been deactivated or blocked by an Administrator." },
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
        "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2",
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
