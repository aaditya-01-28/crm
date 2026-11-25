import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signAccessToken, WEB_SESSION_DURATION_SECONDS } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/app/version",
  "/api/app/download",
  "/downloads",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets (images, icons, APK downloads, etc.)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/downloads") ||
    /\.(png|jpg|jpeg|svg|webp|ico|csv|apk)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const cookieAccessToken = request.cookies.get("access_token")?.value;
  const cookieRefreshToken = request.cookies.get("refresh_token")?.value;
  const token = cookieAccessToken || bearerToken;

  const isWebCookieSession = Boolean(cookieAccessToken || (!bearerToken && cookieRefreshToken));
  const isWebSessionExpired = (p: { loginAt?: string | null } | null) => {
    if (!p?.loginAt) return false;
    const loginMs = new Date(p.loginAt).getTime();
    if (isNaN(loginMs)) return false;
    return Date.now() - loginMs >= WEB_SESSION_DURATION_SECONDS * 1000;
  };

  let payload = token ? await verifyToken(token, "access") : null;
  if (payload && isWebCookieSession && isWebSessionExpired(payload)) {
    payload = null;
  }
  let renewedAccessToken: string | null = null;

  // Seamless auto-refresh only within the 6-hour webapp login window
  if (!payload && !bearerToken && cookieRefreshToken) {
    const refreshPayload = await verifyToken(cookieRefreshToken, "refresh");
    if (refreshPayload && !isWebSessionExpired(refreshPayload)) {
      payload = refreshPayload;
      try {
        renewedAccessToken = await signAccessToken({
          sub: refreshPayload.sub,
          tenantId: refreshPayload.tenantId,
          role: refreshPayload.role,
          email: refreshPayload.email,
          fullName: refreshPayload.fullName,
          avatarUrl: refreshPayload.avatarUrl,
          mustChangePassword: refreshPayload.mustChangePassword,
          lastLoginAt: refreshPayload.lastLoginAt,
          loginAt: refreshPayload.loginAt,
        });
      } catch (e) {
        console.warn("[PROXY] Failed to re-sign access token:", e);
      }
    }
  }

  if (!payload) {
    // Both access token and refresh token are missing, expired, or invalid
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Token expired or invalid" },
        { status: 401 }
      );
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("access_token");
    response.cookies.delete("refresh_token");
    return response;
  }

  // Forward request
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-tenant-id", payload.tenantId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-email", payload.email);
  requestHeaders.set("x-user-name", payload.fullName);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // If a renewed access token was generated, update the browser's cookie with remaining 6-hr window
  if (renewedAccessToken) {
    const isProd = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
    const remainingSeconds = payload.loginAt
      ? Math.max(1, Math.floor((new Date(payload.loginAt).getTime() + WEB_SESSION_DURATION_SECONDS * 1000 - Date.now()) / 1000))
      : WEB_SESSION_DURATION_SECONDS;
    response.cookies.set("access_token", renewedAccessToken, {
      httpOnly: true,
      path: "/",
      maxAge: remainingSeconds,
      sameSite: "lax",
      secure: isProd,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv)$).*)",
  ],
};
