import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid } from "@/lib/security";

const ALLOWED_PUSH_STATUSES = new Set(["pending", "ringing", "in_call", "completed", "cancelled"]);

// Cached flag so DDL is never executed on high-frequency polling requests
let pushTableChecked = false;

async function ensurePushTable(client: any) {
  if (pushTableChecked) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS push_to_dial_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      rep_id UUID NOT NULL,
      lead_id UUID,
      phone_number VARCHAR(50) NOT NULL,
      contact_name VARCHAR(255),
      company_name VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_push_to_dial_rep_status ON push_to_dial_jobs (rep_id, status, created_at DESC);
  `).catch((err: any) => {
    console.error("[PUSH_TO_DIAL_TABLE_INIT]", err?.message);
  });
  pushTableChecked = true;
}

/**
 * POST /api/telephony/push-to-dial
 * Initiated from Web CRM by sales representative to dial prospect on phone.
 */
export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    const { leadId, phoneNumber, contactName, companyName } = body;

    if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json(
        { error: "phoneNumber is required to push dial trigger" },
        { status: 400 }
      );
    }

    if (leadId !== undefined && leadId !== null && !isValidUuid(leadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    return await withClient(async (client) => {
      await ensurePushTable(client);

      if (leadId) {
        const leadCheck = await client.query(
          `SELECT id, assigned_rep_id as "assignedRepId" FROM leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [leadId, tenantId]
        );
        if (leadCheck.rows.length === 0) {
          return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }
        if (isSalesRep(role) && leadCheck.rows[0].assignedRepId && leadCheck.rows[0].assignedRepId !== repId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // Cancel any older pending push jobs for this rep in this tenant
      await client.query(
        `UPDATE push_to_dial_jobs 
         SET status = 'cancelled', updated_at = NOW() 
         WHERE rep_id = $1 AND tenant_id = $2 AND status = 'pending'`,
        [repId, tenantId]
      );

      // Insert new push-to-dial trigger
      const res = await client.query(
        `INSERT INTO push_to_dial_jobs 
          (tenant_id, rep_id, lead_id, phone_number, contact_name, company_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
         RETURNING id, tenant_id as "tenantId", rep_id as "repId", lead_id as "leadId",
                   phone_number as "phoneNumber", contact_name as "contactName",
                   company_name as "companyName", status, created_at as "createdAt"`,
        [
          tenantId,
          repId,
          leadId || null,
          phoneNumber.trim(),
          contactName || null,
          companyName || null,
        ]
      );

      const job = res.rows[0];
      return NextResponse.json(
        {
          success: true,
          message: "Dial command dispatched to rep's companion phone",
          job,
        },
        { status: 201 }
      );
    });
  } catch (error) {
    console.error("[PUSH_TO_DIAL_POST]", error);
    return NextResponse.json(
      { error: "Failed to queue push-to-dial job" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/telephony/push-to-dial
 * Polled by mobile app (with ?poll=true) or checked by web CRM (with ?jobId=...).
 */
export async function GET(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const { searchParams } = new URL(request.url);

  const jobId = searchParams.get("jobId");
  const isPolling = searchParams.get("poll") === "true";

  if (jobId && !isValidUuid(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      // Web CRM checking specific job status
      if (jobId) {
        const res = await client.query(
          `SELECT id, rep_id as "repId", lead_id as "leadId",
                  phone_number as "phoneNumber", contact_name as "contactName",
                  company_name as "companyName", status, created_at as "createdAt",
                  updated_at as "updatedAt"
           FROM push_to_dial_jobs
           WHERE id = $1 AND tenant_id = $2 ${isSalesRep(role) ? "AND rep_id = $3" : ""}
           LIMIT 1`,
          isSalesRep(role) ? [jobId, tenantId, repId] : [jobId, tenantId]
        );

        if (res.rows.length === 0) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        return NextResponse.json({ job: res.rows[0] });
      }

      // Companion App polling for pending dial commands (last 3 minutes only)
      if (isPolling) {
        const res = await client.query(
          `SELECT id, rep_id as "repId", lead_id as "leadId",
                  phone_number as "phoneNumber", contact_name as "contactName",
                  company_name as "companyName", status, created_at as "createdAt"
           FROM push_to_dial_jobs
           WHERE rep_id = $1 AND tenant_id = $2
             AND status = 'pending' 
             AND created_at >= NOW() - INTERVAL '3 minutes'
           ORDER BY created_at DESC
           LIMIT 1`,
          [repId, tenantId]
        );

        return NextResponse.json({
          hasJob: res.rows.length > 0,
          job: res.rows[0] || null,
        });
      }

      // Default: list recent jobs for this rep
      const res = await client.query(
        `SELECT id, rep_id as "repId", lead_id as "leadId",
                phone_number as "phoneNumber", contact_name as "contactName",
                company_name as "companyName", status, created_at as "createdAt"
         FROM push_to_dial_jobs
         WHERE rep_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [repId, tenantId]
      );

      return NextResponse.json({ jobs: res.rows });
    });
  } catch (error) {
    console.error("[PUSH_TO_DIAL_GET]", error);
    return NextResponse.json(
      { error: "Failed to retrieve push-to-dial status" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/telephony/push-to-dial
 * Updates job status ('ringing', 'in_call', 'completed', 'cancelled')
 */
export async function PATCH(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const body = await request.json();
    const { jobId, status } = body;

    if (!isValidUuid(jobId) || typeof status !== "string" || !ALLOWED_PUSH_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "Valid jobId and status are required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await ensurePushTable(client);

      const res = await client.query(
        `UPDATE push_to_dial_jobs 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 AND tenant_id = $3 ${isSalesRep(role) ? "AND rep_id = $4" : ""}
         RETURNING id, status, updated_at as "updatedAt"`,
        isSalesRep(role) ? [status, jobId, tenantId, repId] : [status, jobId, tenantId]
      );

      if (res.rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, job: res.rows[0] });
    });
  } catch (error) {
    console.error("[PUSH_TO_DIAL_PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update push-to-dial status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/telephony/push-to-dial
 * Cancels a pending push-to-dial job
 */
export async function DELETE(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const { searchParams } = new URL(request.url);

  const jobId = searchParams.get("jobId");
  if (jobId && !isValidUuid(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      await ensurePushTable(client);

      if (jobId) {
        await client.query(
          `UPDATE push_to_dial_jobs 
           SET status = 'cancelled', updated_at = NOW() 
           WHERE id = $1 AND tenant_id = $2 ${isSalesRep(role) ? "AND rep_id = $3" : ""}`,
          isSalesRep(role) ? [jobId, tenantId, repId] : [jobId, tenantId]
        );
      } else {
        await client.query(
          `UPDATE push_to_dial_jobs 
           SET status = 'cancelled', updated_at = NOW() 
           WHERE rep_id = $1 AND tenant_id = $2 AND status = 'pending'`,
          [repId, tenantId]
        );
      }

      return NextResponse.json({ success: true, message: "Job cancelled" });
    });
  } catch (error) {
    console.error("[PUSH_TO_DIAL_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to cancel push-to-dial job" },
      { status: 500 }
    );
  }
}
