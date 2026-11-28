import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signAccessToken, signRefreshToken, setAuthCookies, validateSessionRecord } from "@/lib/auth";
import { queryUserById } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`refresh:${ip}`, 60, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many token refresh attempts. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    let tokenToVerify: string | null = null;
    let isMobileClient = false;

    // Check request body
    try {
      const body = await request.json();
      if (body?.refreshToken) {
        tokenToVerify = body.refreshToken;
      }
      if (body?.client === "mobile") {
        isMobileClient = true;
      }
    } catch {}

    // Check Authorization header if not in body
    if (!tokenToVerify) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
        tokenToVerify = authHeader.slice(7).trim();
      }
    }

    // Check cookies as fallback
    if (!tokenToVerify) {
      const cookie = request.cookies.get("refresh_token")?.value;
      if (cookie) {
        tokenToVerify = cookie;
      }
    }

    if (!tokenToVerify) {
      return NextResponse.json({ error: "Refresh token is required" }, { status: 400 });
    }

    const payload = await verifyToken(tokenToVerify, "refresh");
    if (!payload || !payload.sub) {
      return NextResponse.json({ error: "Invalid or expired session. Please log in again." }, { status: 401 });
    }

    // Ensure user & org still exist, are active, and token_version matches
    const user = await queryUserById(payload.sub);
    if (!user || !user.isActive || !user.orgIsActive) {
      return NextResponse.json({ error: "Account or organization is inactive." }, { status: 403 });
    }

    const validSession = validateSessionRecord(payload, {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
      orgIsActive: user.orgIsActive,
    });
    if (!validSession) {
      return NextResponse.json({ error: "Session has been revoked. Please log in again." }, { status: 401 });
    }

    const now = new Date().toISOString();
    const newPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl ?? null,
      mustChangePassword: Boolean(user.mustChangePassword),
      tokenVersion: user.tokenVersion,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : now,
      loginAt: now,
      phoneNumber: user.phoneNumber || null,
    };

    const newAccessToken = await signAccessToken(
      newPayload,
      isMobileClient ? "12h" : undefined
    );
    const newRefreshToken = await signRefreshToken(newPayload);

    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        tenantName: user.tenant?.name || "Textora",
        avatarUrl: user.avatarUrl ?? null,
      },
    });

    setAuthCookies(response, newAccessToken, newRefreshToken);
    return response;
  } catch (error) {
    console.error("[AUTH_REFRESH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
