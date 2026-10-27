import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Ensure push_to_dial_jobs table exists
async function ensurePushTable(client: any) {
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
    CREATE INDEX IF NOT EXISTS idx_push_to_dial_rep_status ON push_to_dial_jobs (rep_id, status);
  `).catch((err: any) => {
    console.error("[PUSH_TO_DIAL_TABLE_INIT]", err?.message);
  });
}

/**
 * POST /api/telephony/push-to-dial
 * Initiated from Web CRM by sales representative to dial prospect on phone.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { leadId, phoneNumber, contactName, companyName } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "phoneNumber is required to push dial trigger" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await ensurePushTable(client);

      // Cancel any older pending push jobs for this rep
      await client.query(
        `UPDATE push_to_dial_jobs 
         SET status = 'cancelled', updated_at = NOW() 
         WHERE rep_id = $1 AND status = 'pending'`,
        [repId]
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
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = searchParams.get("jobId");
  const isPolling = searchParams.get("poll") === "true";

  try {
    return await withClient(async (client) => {
      await ensurePushTable(client);

      // Web CRM checking specific job status
      if (jobId) {
        const res = await client.query(
          `SELECT id, rep_id as "repId", lead_id as "leadId",
                  phone_number as "phoneNumber", contact_name as "contactName",
                  company_name as "companyName", status, created_at as "createdAt",
                  updated_at as "updatedAt"
           FROM push_to_dial_jobs
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [jobId, tenantId]
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
           WHERE rep_id = $1 
             AND status = 'pending' 
             AND created_at >= NOW() - INTERVAL '3 minutes'
           ORDER BY created_at DESC
           LIMIT 1`,
          [repId]
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
         WHERE rep_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [repId]
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
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { jobId, status } = body;

    if (!jobId || !status) {
      return NextResponse.json(
        { error: "jobId and status are required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      await ensurePushTable(client);

      const res = await client.query(
        `UPDATE push_to_dial_jobs 
         SET status = $1, updated_at = NOW() 
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, status, updated_at as "updatedAt"`,
        [status, jobId, tenantId]
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
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId || !repId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = searchParams.get("jobId");

  try {
    return await withClient(async (client) => {
      await ensurePushTable(client);

      if (jobId) {
        await client.query(
          `UPDATE push_to_dial_jobs 
           SET status = 'cancelled', updated_at = NOW() 
           WHERE id = $1 AND tenant_id = $2`,
          [jobId, tenantId]
        );
      } else {
        await client.query(
          `UPDATE push_to_dial_jobs 
           SET status = 'cancelled', updated_at = NOW() 
           WHERE rep_id = $1 AND status = 'pending'`,
          [repId]
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
