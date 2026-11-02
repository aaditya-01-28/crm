import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lastLoginAt = session.lastLoginAt || session.loginAt || null;
  if (!lastLoginAt) {
    try {
      const userRes = await withClient(async (client) => {
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;").catch(() => {});
        const res = await client.query(
          `SELECT last_login_at as "lastLoginAt" FROM users WHERE id = $1`,
          [session.sub]
        );
        return res.rows[0];
      });
      if (userRes?.lastLoginAt) {
        lastLoginAt = new Date(userRes.lastLoginAt).toISOString();
      }
    } catch {}
  }

  return NextResponse.json({
    user: {
      ...session,
      lastLoginAt: lastLoginAt || session.lastLoginAt || session.loginAt || null,
    },
  });
}
