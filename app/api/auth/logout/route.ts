import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, getSession, verifyToken } from "@/lib/auth";
import { withClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;
    const session = await getSession(request);
    if (session?.sub) {
      userId = session.sub;
    } else {
      const refreshCookie = request.cookies.get("refresh_token")?.value;
      if (refreshCookie) {
        const refreshPayload = await verifyToken(refreshCookie, "refresh");
        if (refreshPayload?.sub) {
          userId = refreshPayload.sub;
        }
      }
    }

    if (userId) {
      await withClient(async (client) => {
        await client.query(
          "UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1",
          [userId]
        );
      }).catch((err) => console.warn("[LOGOUT] token revocation update warning:", err));
    }
  } catch {
    // Always clear auth cookies even if session lookup fails
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response);
  return response;
}
