import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // If user does not exist, return a generic success message so attacker cannot enumerate emails
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If this email is registered with Textora Engage, password reset instructions have been dispatched to the inbox.",
      });
    }

    // If user is deactivated/blocked
    if (!user.isActive) {
      return NextResponse.json(
        { error: "This account has been deactivated or suspended by an Administrator. Please reach out to your organization Super Admin." },
        { status: 403 }
      );
    }

    // Generate secure random token valid for 60 minutes
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

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
      // Provide previewUrl if SMTP is not configured in dev
      ...(!mailResult.delivered ? { devPreviewUrl: resetUrl } : {}),
    });
  } catch (error) {
    console.error("[FORGOT_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { error: "An error occurred while processing your password reset request. Please try again." },
      { status: 500 }
    );
  }
}
