import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    return await withClient(async (client) => {
      const userRes = await client.query(
        "SELECT id, email, full_name as \"fullName\", is_active as \"isActive\" FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json({
          success: true,
          message: "If this email is registered with Textora Engage, password reset instructions have been dispatched to the inbox.",
        });
      }

      const user = userRes.rows[0];

      if (!user.isActive) {
        return NextResponse.json(
          { error: "This account has been deactivated or suspended by an Administrator. Please reach out to your organization Super Admin." },
          { status: 403 }
        );
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await client.query(
        "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
        [resetToken, resetTokenExpiry, user.id]
      );

      const origin =
        request.headers.get("origin") ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

      const resetUrl = `${origin}/reset-password?token=${resetToken}`;

      const mailResult = await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        resetUrl,
      });

      return NextResponse.json({
        success: true,
        message: `Password reset link has been dispatched to ${user.email}. Please check your inbox and spam folder.`,
        delivered: mailResult.delivered,
        ...(!mailResult.delivered ? { devPreviewUrl: resetUrl } : {}),
      });
    });
  } catch (error) {
    console.error("[FORGOT_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { error: "An error occurred while processing your password reset request. Please try again." },
      { status: 500 }
    );
  }
}
