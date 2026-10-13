import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import bcrypt from "bcryptjs";
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgName, email, password, fullName } = body;

    if (!orgName || !email || !password || !fullName) {
      return NextResponse.json(
        { error: "orgName, fullName, email, and password are required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      const existing = await client.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email.trim()]
      );

      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "Email already registered" },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const orgRes = await client.query(
        "INSERT INTO organizations (name, created_at) VALUES ($1, NOW()) RETURNING id, name",
        [orgName.trim()]
      );
      const org = orgRes.rows[0];

      const userRes = await client.query(
        `INSERT INTO users (tenant_id, full_name, email, password_hash, role, is_active, created_at)
         VALUES ($1, $2, $3, $4, 'super_admin', true, NOW())
         RETURNING id, full_name as "fullName", email, role`,
        [org.id, fullName.trim(), email.trim(), passwordHash]
      );
      const user = userRes.rows[0];

      const jwtPayload = {
        sub: user.id,
        tenantId: org.id,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
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
    });
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
