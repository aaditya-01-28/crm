import { NextRequest, NextResponse } from "next/server";
import { requireActiveSession } from "@/lib/auth";
import { withClient } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lastLoginAt = session.lastLoginAt || null;
  if (!lastLoginAt && session.sub) {
    try {
      const userRes = await withClient(async (client) => {
        const res = await client.query(
          `SELECT previous_login_at as "previousLoginAt" FROM users WHERE id = $1 AND tenant_id = $2`,
          [session.sub, session.tenantId]
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
