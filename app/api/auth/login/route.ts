import { NextRequest, NextResponse } from "next/server";
import { queryUserByEmail, withClient } from "@/lib/db";
import bcrypt from "bcryptjs";
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await queryUserByEmail(email.trim());

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "This user account has been blocked or suspended by an Administrator. Please contact Super Admin." },
        { status: 403 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const mustChangePassword = Boolean(user.mustChangePassword);

    const now = new Date();
    const loginTimestamp = now.toISOString();

    // Record last login in database
    await withClient(async (client) => {
      await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;").catch(() => {});
      await client.query("UPDATE users SET last_login_at = $1 WHERE id = $2", [now, user.id]).catch(() => {});
    }).catch((err) => console.warn("[LOGIN] failed to update last_login_at:", err));

    const jwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl && user.avatarUrl.length < 500 ? user.avatarUrl : null,
      mustChangePassword,
      lastLoginAt: loginTimestamp,
      loginAt: loginTimestamp,
    };

    const accessToken = await signAccessToken(jwtPayload);
    const refreshToken = await signRefreshToken(jwtPayload);

    const response = NextResponse.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tenantName: user.tenant.name,
        avatarUrl: user.avatarUrl ?? null,
        mustChangePassword,
        lastLoginAt: loginTimestamp,
      },
      mustChangePassword,
      accessToken,
      refreshToken,
    });

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("[LOGIN]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
