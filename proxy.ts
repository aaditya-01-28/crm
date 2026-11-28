import { NextRequest, NextResponse } from "next/server";
import { verifyToken, signAccessToken, WEB_SESSION_DURATION_SECONDS } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/update-password",
  "/api/app/version",
  "/api/app/download",
  "/downloads",
];

const IDENTITY_HEADERS = [
  "x-user-id",
  "x-tenant-id",
  "x-user-role",
  "x-user-email",
  "x-user-name",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always strip client-supplied identity headers before any routing or early return
  const sanitizedHeaders = new Headers(request.headers);
  for (const headerName of IDENTITY_HEADERS) {
    sanitizedHeaders.delete(headerName);
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  // Allow Next.js internals and non-API static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/downloads") ||
    (!pathname.startsWith("/api/") && /\.(png|jpg|jpeg|svg|webp|ico|csv|apk)$/i.test(pathname))
  ) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
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
          tokenVersion: refreshPayload.tokenVersion ?? 1,
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

  // Forward verified identity headers (all prior client values already stripped)
  sanitizedHeaders.set("x-user-id", payload.sub);
  sanitizedHeaders.set("x-tenant-id", payload.tenantId);
  sanitizedHeaders.set("x-user-role", payload.role);
  sanitizedHeaders.set("x-user-email", payload.email);
  sanitizedHeaders.set("x-user-name", payload.fullName);

  const response = NextResponse.next({ request: { headers: sanitizedHeaders } });

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
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv|apk)$).*)",
  ],
};
