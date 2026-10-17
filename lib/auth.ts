import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-in-production"
);

export interface JWTPayload {
  sub: string;       // user id
  tenantId: string;
  role: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRY || "15m")
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRY || "7d")
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

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string
) {
  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; Max-Age=900; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
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
