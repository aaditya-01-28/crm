import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requireActiveSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
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

    const uniquePhones = Array.from(
      new Set(
        phones
          .slice(0, 5000)
          .map((p) => {
            const d = String(p).replace(/\D/g, "");
            return d.length >= 10 ? d.slice(-10) : d;
          })
          .filter(Boolean)
      )
    );
    if (uniquePhones.length === 0) {
      return NextResponse.json({ existing: [] });
    }

    return await withClient(async (client) => {
      const res = await client.query(
        `SELECT id,
                COALESCE(NULLIF(RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10), ''), phone_number) as "phone",
                phone_number as "rawPhone",
                contact_name as "contactName",
                company_name as "companyName", status, service_type as "serviceType",
                custom_metadata->>'secondaryPhone' as "secondaryPhone"
         FROM leads
         WHERE tenant_id = $1
           AND (
             phone_number = ANY($2::varchar[])
             OR RIGHT(REGEXP_REPLACE(phone_number, '\\D', '', 'g'), 10) = ANY($2::text[])
             OR custom_metadata->>'secondaryPhone' = ANY($2::varchar[])
             OR RIGHT(REGEXP_REPLACE(COALESCE(custom_metadata->>'secondaryPhone', ''), '\\D', '', 'g'), 10) = ANY($2::text[])
           )`,
        [session.tenantId, uniquePhones]
      );
      return NextResponse.json({ existing: res.rows });
    });
  } catch (error) {
    console.error("[IMPORT CHECK DUPLICATES]", error);
    return NextResponse.json({ error: "Failed to check duplicates" }, { status: 500 });
  }
}
