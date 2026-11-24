import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-change-in-production-min-32-chars-long");

if (!rawSecret && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: JWT_SECRET environment variable must be set in production.");
}

const JWT_SECRET = new TextEncoder().encode(rawSecret);

export const ACCESS_TOKEN_DURATION_SECONDS = 2 * 60 * 60; // 2 hours
export const SESSION_DURATION_HOURS = 720; // 30 days
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const JWT_SESSION_EXPIRY = "2h";
export const JWT_REFRESH_EXPIRY = "30d";

export interface JWTPayload {
  sub: string;       // user id
  tenantId: string;
  role: string;
  email: string;
  fullName: string;
  tokenType?: "access" | "refresh";
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  loginAt?: string | null;
  phoneNumber?: string | null;
}

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  const expiry = process.env.JWT_EXPIRY || JWT_SESSION_EXPIRY;
  return new SignJWT({ ...payload, tokenType: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  const expiry = process.env.JWT_REFRESH_EXPIRY || JWT_REFRESH_EXPIRY;
  return new SignJWT({ ...payload, tokenType: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string,
  expectedType?: "access" | "refresh"
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const data = payload as unknown as JWTPayload;
    if (expectedType && data.tokenType && data.tokenType !== expectedType) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function getSession(request?: NextRequest | Request): Promise<JWTPayload | null> {
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      const payload = await verifyToken(token, "access");
      if (payload) return payload;
    }
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
    if (token) {
      const payload = await verifyToken(token, "access");
      if (payload) return payload;
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
  const isProd = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
  const secureFlag = isProd ? "; Secure" : "";

  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; Max-Age=${ACCESS_TOKEN_DURATION_SECONDS}; SameSite=Lax${secureFlag}`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; SameSite=Lax${secureFlag}`
  );
}

export function clearAuthCookies(response: Response) {
  const isProd = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
  const secureFlag = isProd ? "; Secure" : "";

  response.headers.append(
    "Set-Cookie",
    `access_token=; HttpOnly; Path=/; Max-Age=0${secureFlag}`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=; HttpOnly; Path=/; Max-Age=0${secureFlag}`
  );
}
