import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
} from "@/lib/auth";
import {
  checkRateLimit,
  getClientIp,
  validateStrongPassword,
} from "@/lib/security";

function isProvisionAuthorized(request: NextRequest): boolean {
  if (process.env.ALLOW_PUBLIC_REGISTRATION === "true") {
    return true;
  }
  const configuredSecret = process.env.PLATFORM_PROVISION_SECRET?.trim();
  const providedSecret = request.headers.get("x-provision-secret")?.trim() || "";
  if (!configuredSecret || !providedSecret) {
    return false;
  }
  const expectedDigest = crypto.createHash("sha256").update(configuredSecret).digest();
  const providedDigest = crypto.createHash("sha256").update(providedSecret).digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest);
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    if (!isProvisionAuthorized(request)) {
      return NextResponse.json(
        { error: "Public self-registration is disabled. Contact your platform administrator to provision a workspace." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { orgName, email, password, fullName } = body;

    if (
      typeof orgName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof fullName !== "string" ||
      !orgName.trim() ||
      !email.trim() ||
      !fullName.trim()
    ) {
      return NextResponse.json(
        { error: "orgName, fullName, email, and password are required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json(
        { error: "Please provide a valid work email address" },
        { status: 400 }
      );
    }

    const pwCheck = validateStrongPassword(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await client.query(
          "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
          [cleanEmail]
        );

        if (existing.rows.length > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Email already registered" },
            { status: 409 }
          );
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const orgRes = await client.query(
          "INSERT INTO organizations (name, is_active, created_at) VALUES ($1, true, NOW()) RETURNING id, name",
          [orgName.trim()]
        );
        const org = orgRes.rows[0];

        const userRes = await client.query(
          `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active, token_version, created_at)
           VALUES ($1, $2, $3, $4, 'super_admin', true, 1, NOW())
           RETURNING id, full_name as "fullName", email, role, COALESCE(token_version, 1)::int as "tokenVersion"`,
          [org.id, fullName.trim(), cleanEmail, passwordHash]
        );
        const user = userRes.rows[0];
        await client.query("COMMIT");

        const jwtPayload = {
          sub: user.id,
          tenantId: org.id,
          role: user.role,
          email: user.email,
          fullName: user.fullName,
          tokenVersion: user.tokenVersion,
        };

        const accessToken = await signAccessToken(jwtPayload);
        const refreshToken = await signRefreshToken(jwtPayload);

        const response = NextResponse.json(
          {
            user: {
              id: user.id,
              fullName: user.fullName,
              email: user.email,
              role: user.role,
              tenantName: org.name,
            },
          },
          { status: 201 }
        );

        setAuthCookies(response, accessToken, refreshToken);
        return response;
      } catch (innerError) {
        await client.query("ROLLBACK").catch(() => {});
        throw innerError;
      }
    });
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
