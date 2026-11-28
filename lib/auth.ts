import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { withClient } from "@/lib/db";

const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "dev-only-secret-change-in-production-min-32-chars-long");

if (!rawSecret && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: JWT_SECRET environment variable must be set in production.");
}

const JWT_SECRET = new TextEncoder().encode(rawSecret);

export const ACCESS_TOKEN_DURATION_SECONDS = 9 * 60 * 60; // 9 hours
export const WEB_SESSION_DURATION_SECONDS = 9 * 60 * 60; // 9 hours for webapp login
export const SESSION_DURATION_HOURS = 9;
export const SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days (mobile refresh token)
export const JWT_SESSION_EXPIRY = "9h";
export const JWT_REFRESH_EXPIRY = "30d";

export interface JWTPayload {
  sub: string;       // user id
  tenantId: string;
  role: string;
  email: string;
  fullName: string;
  tokenType?: "access" | "refresh";
  tokenVersion?: number;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  loginAt?: string | null;
  phoneNumber?: string | null;
}

export interface SessionDbState {
  id: string;
  tenantId: string;
  role: string;
  isActive: boolean;
  tokenVersion: number;
  orgIsActive: boolean;
  mustChangePassword?: boolean;
}

export async function signAccessToken(
  payload: JWTPayload,
  expiresIn?: string
): Promise<string> {
  const expiry = expiresIn || process.env.JWT_EXPIRY || JWT_SESSION_EXPIRY;
  return new SignJWT({
    ...payload,
    tokenVersion: payload.tokenVersion ?? 1,
    tokenType: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  const expiry = process.env.JWT_REFRESH_EXPIRY || JWT_REFRESH_EXPIRY;
  return new SignJWT({
    ...payload,
    tokenVersion: payload.tokenVersion ?? 1,
    tokenType: "refresh",
  })
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
    if (expectedType && data.tokenType !== expectedType) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function validateSessionRecord(
  session: JWTPayload,
  dbUser: SessionDbState | null
): JWTPayload | null {
  if (!dbUser || !dbUser.isActive || !dbUser.orgIsActive) {
    return null;
  }
  const sessionTokenVersion = typeof session.tokenVersion === "number" ? session.tokenVersion : 1;
  const dbTokenVersion = typeof dbUser.tokenVersion === "number" ? dbUser.tokenVersion : 1;
  if (sessionTokenVersion !== dbTokenVersion) {
    return null;
  }
  return {
    ...session,
    tenantId: dbUser.tenantId,
    role: dbUser.role,
    tokenVersion: dbTokenVersion,
    mustChangePassword: dbUser.mustChangePassword ?? session.mustChangePassword,
  };
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

/**
 * Verifies the JWT signature/expiry AND confirms against PostgreSQL that:
 * - the user is still active,
 * - their organization is active,
 * - the tokenVersion has not been revoked by logout/password reset/block,
 * - and returns the authoritative DB role & tenantId.
 */
export async function requireActiveSession(
  request?: NextRequest | Request
): Promise<JWTPayload | null> {
  const session = await getSession(request);
  if (!session?.sub || !session?.tenantId) {
    return null;
  }
  try {
    const dbUser = await withClient(async (client) => {
      const res = await client.query<SessionDbState>(
        `SELECT u.id,
                u.tenant_id as "tenantId",
                u.role,
                u.is_active as "isActive",
                COALESCE(u.token_version, 1)::int as "tokenVersion",
                COALESCE(u.must_change_password, false) as "mustChangePassword",
                COALESCE(o.is_active, true) as "orgIsActive"
         FROM users u
         JOIN organizations o ON u.tenant_id = o.id
         WHERE u.id = $1
         LIMIT 1`,
        [session.sub]
      );
      return res.rows[0] || null;
    });
    return validateSessionRecord(session, dbUser);
  } catch (err) {
    console.error("[AUTH_SESSION_VERIFY]", err);
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
    `access_token=${accessToken}; HttpOnly; Path=/; Max-Age=${WEB_SESSION_DURATION_SECONDS}; SameSite=Lax${secureFlag}`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; Max-Age=${WEB_SESSION_DURATION_SECONDS}; SameSite=Lax${secureFlag}`
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
