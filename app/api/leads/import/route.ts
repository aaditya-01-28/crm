import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

interface ImportedLead {
  phone: string | number;
  name?: string;
  company?: string;
  vertical?: string;
  service?: string;
  source?: string;
}

function cleanPhoneNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let str = String(raw).trim();
  if (str.includes(".") && !str.toLowerCase().includes("e")) {
    str = str.split(".")[0];
  }
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;

  if (!tenantId || !role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(role, "leads:import")) {
    return NextResponse.json(
      { error: "Forbidden: Only managers and admins can import leads" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const {
      leads,
      assignToRepId,
      assignmentMode,
    }: {
      leads: ImportedLead[];
      assignToRepId?: string | null;
      assignmentMode?: "unassigned" | "specific" | "round_robin";
    } = body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const processed = leads.map((l) => ({
      ...l,
      phone: cleanPhoneNumber(l.phone),
    }));

    const validLeads = processed.filter((l) => l.phone.length === 10);

    if (validLeads.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid 10-digit phone numbers detected. Please ensure your sheet contains 10-digit mobile numbers.",
        },
        { status: 400 }
      );
    }

    const seenInBatch = new Set<string>();
    const batchUnique: typeof validLeads = [];
    let batchDuplicatesCount = 0;

    for (const item of validLeads) {
      if (seenInBatch.has(item.phone)) {
        batchDuplicatesCount++;
      } else {
        seenInBatch.add(item.phone);
        batchUnique.push(item);
      }
    }

    return await withClient(async (client) => {
      const phones = batchUnique.map((l) => l.phone);
      const existingRes = await client.query(
        "SELECT phone_number FROM leads WHERE tenant_id = $1 AND phone_number = ANY($2::varchar[])",
        [tenantId, phones]
      );

      const existingPhones = new Set(existingRes.rows.map((e: any) => e.phone_number));
      const newLeads = batchUnique.filter((l) => !existingPhones.has(l.phone));

      if (newLeads.length === 0) {
        return NextResponse.json({
          imported: 0,
          duplicates: batchUnique.length + batchDuplicatesCount,
          invalid: leads.length - validLeads.length,
          total: leads.length,
          message: "All phone numbers in this file already exist in your CRM database",
        });
      }

      let roundRobinReps: string[] = [];
      if (assignmentMode === "round_robin") {
        const repsRes = await client.query(
          "SELECT id FROM users WHERE tenant_id = $1 AND role = 'sales_rep' AND is_active = true",
          [tenantId]
        );
        roundRobinReps = repsRes.rows.map((r: any) => r.id);
      }

      let defaultTargetRep: string | null = null;
      if (assignmentMode === "specific" && assignToRepId && assignToRepId !== "unassigned") {
        const userRes = await client.query(
          "SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
          [assignToRepId, tenantId]
        );
        if (userRes.rows.length > 0) {
          defaultTargetRep = userRes.rows[0].id;
        }
      }

      const startTime = Date.now();
      const BATCH_SIZE = 250;
      let importedCount = 0;

      await client.query("BEGIN");
      try {
        for (let b = 0; b < newLeads.length; b += BATCH_SIZE) {
          const chunk = newLeads.slice(b, b + BATCH_SIZE);
          const valueClauses: string[] = [];
          const params: any[] = [tenantId];
          let paramIdx = 2;

          for (let i = 0; i < chunk.length; i++) {
            const globalIdx = b + i;
            const l = chunk[i];
            let assignedId: string | null = null;
            if (roundRobinReps.length > 0) {
              assignedId = roundRobinReps[globalIdx % roundRobinReps.length];
            } else {
              assignedId = defaultTargetRep;
            }

            valueClauses.push(
              `($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, 'new', NOW(), NOW())`
            );

            params.push(
              assignedId,
              assignedId,
              assignedId ? new Date() : null,
              l.phone,
              l.name && l.name.trim() !== "" ? l.name.trim() : null,
              l.company && l.company.trim() !== "" ? l.company.trim() : null,
              l.vertical && l.vertical.trim() !== "" ? l.vertical.trim() : null,
              l.service && l.service.trim() !== "" ? l.service.trim() : null,
              l.source || "Vendor Cold List"
            );
            paramIdx += 9;
          }

          const insertSql = `
            INSERT INTO leads (
              tenant_id, assigned_rep_id, first_assigned_rep_id, first_assigned_at,
              phone_number, contact_name, company_name, business_vertical,
              service_type, source, status, created_at, updated_at
            )
            VALUES ${valueClauses.join(", ")}
            ON CONFLICT DO NOTHING
          `;

          const res = await client.query(insertSql, params);
          importedCount += res.rowCount || chunk.length;
        }

        await client.query("COMMIT");
      } catch (insertErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw insertErr;
      }

      const durationMs = Date.now() - startTime;

      return NextResponse.json({
        imported: importedCount,
        duplicates: existingPhones.size + batchDuplicatesCount,
        invalid: leads.length - validLeads.length,
        total: leads.length,
        durationMs,
      });
    });
  } catch (error) {
    console.error("[IMPORT]", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
