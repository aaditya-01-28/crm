import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { isValidUuid } from "@/lib/security";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Level 3 Super Admin can delete call logs
  if (!isAdmin(session.role)) {
    return NextResponse.json(
      { error: "Forbidden: Only Level 3 Super Admins can delete call logs." },
      { status: 403 }
    );
  }

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Invalid call ID" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await client.query(
          `SELECT id, lead_id as "leadId", disposition
           FROM call_logs
           WHERE id = $1 AND tenant_id = $2`,
          [id, session.tenantId]
        );

        if (existing.rows.length === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Call log not found" }, { status: 404 });
        }

        const { leadId } = existing.rows[0];

        await client.query(
          `DELETE FROM call_logs WHERE id = $1 AND tenant_id = $2`,
          [id, session.tenantId]
        );

        await client.query(
          `UPDATE leads
           SET rnr_count = COALESCE((SELECT COUNT(*)::int FROM call_logs WHERE lead_id = $1 AND tenant_id = $2 AND disposition = 'RNR'), 0),
               updated_at = NOW()
           WHERE id = $1 AND tenant_id = $2`,
          [leadId, session.tenantId]
        );

        await client.query("COMMIT");
        return NextResponse.json({ success: true, deleted: true });
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      }
    });
  } catch (error) {
    console.error("[CALL LOG DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete call log" },
      { status: 500 }
    );
  }
}
