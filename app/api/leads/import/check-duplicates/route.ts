import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !session?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session.role, "leads:import")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const phones: string[] = Array.isArray(body.phones) ? body.phones.filter(Boolean) : [];
    if (phones.length === 0) {
      return NextResponse.json({ existing: [] });
    }

    const uniquePhones = Array.from(new Set(phones.slice(0, 5000)));

    return await withClient(async (client) => {
      const res = await client.query(
        `SELECT id, phone_number as "phone", contact_name as "contactName",
                company_name as "companyName", status, service_type as "serviceType"
         FROM leads
         WHERE tenant_id = $1 AND phone_number = ANY($2::varchar[])`,
        [session.tenantId, uniquePhones]
      );
      return NextResponse.json({ existing: res.rows });
    });
  } catch (error) {
    console.error("[IMPORT CHECK DUPLICATES]", error);
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 });
  }
}
