import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lastLoginAt = session.lastLoginAt || null;
  if (!lastLoginAt && session.sub) {
    try {
      const userRes = await withClient(async (client) => {
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_login_at TIMESTAMPTZ;").catch(() => {});
        const res = await client.query(
          `SELECT previous_login_at as "previousLoginAt" FROM users WHERE id = $1`,
          [session.sub]
        );
        return res.rows[0];
      });
      if (userRes?.previousLoginAt) {
        lastLoginAt = new Date(userRes.previousLoginAt).toISOString();
      }
    } catch {}
  }

  return NextResponse.json({
    user: {
      ...session,
      lastLoginAt: lastLoginAt || null,
    },
  });
}
