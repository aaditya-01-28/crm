import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-in-production"
);

export const SESSION_DURATION_HOURS = 9;
export const SESSION_DURATION_SECONDS = 9 * 60 * 60; // 32400 seconds (9 hours)
export const JWT_SESSION_EXPIRY = "9h";

export interface JWTPayload {
  sub: string;       // user id
  tenantId: string;
  role: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  loginAt?: string | null;
}

function resolveExpiry(envVal: string | undefined, defaultExpiry: string): string {
  // Guard: If legacy env variable has "15m" or is empty, enforce user-requested 9 hours
  if (!envVal || envVal === "15m") {
    return defaultExpiry;
  }
  return envVal;
}

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  const expiry = resolveExpiry(process.env.JWT_EXPIRY, JWT_SESSION_EXPIRY);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  const expiry = resolveExpiry(process.env.JWT_REFRESH_EXPIRY, "7d");
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(request?: NextRequest | Request): Promise<JWTPayload | null> {
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      const payload = await verifyToken(token);
      if (payload) return payload;
    }
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) return payload;
    }
    // Seamless fallback to refresh_token if access_token is expired or missing
    const refreshToken = cookieStore.get("refresh_token")?.value;
    if (refreshToken) {
      return await verifyToken(refreshToken);
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAuthSession(request?: NextRequest | Request): Promise<JWTPayload | null> {
  return getSession(request);
}

export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string
) {
  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; SameSite=Lax`
  );
}

export function clearAuthCookies(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `access_token=; HttpOnly; Path=/; Max-Age=0`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=; HttpOnly; Path=/; Max-Age=0`
  );
}
