import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;

  if (!tenantId || !role || !["super_admin", "sales_manager"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return await withClient(async (client) => {
      const res = await client.query(
        `SELECT u.id, u.full_name as "fullName", u.email, u.phone_number as "phoneNumber",
                u.role, u.language, u.is_active as "isActive", u.created_at as "createdAt",
                (SELECT COUNT(*)::int FROM leads WHERE assigned_rep_id = u.id) as "assignedLeadsCount",
                (SELECT COUNT(*)::int FROM call_logs WHERE rep_id = u.id) as "callLogsCount",
                (SELECT COUNT(*)::int FROM deals WHERE rep_id = u.id) as "dealsCount"
         FROM users u
         WHERE u.tenant_id = $1
         ORDER BY u.created_at ASC`,
        [tenantId]
      );

      const users = res.rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        email: r.email,
        phoneNumber: r.phoneNumber,
        role: r.role,
        language: r.language,
        isActive: r.isActive,
        createdAt: r.createdAt,
        _count: {
          assignedLeads: r.assignedLeadsCount,
          callLogs: r.callLogsCount,
          deals: r.dealsCount,
        },
      }));

      return NextResponse.json({ users });
    });
  } catch (error) {
    console.error("[TEAM_GET_ERROR]", error);
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId;
  const role = request.headers.get("x-user-role") || session?.role;

  if (!tenantId || role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fullName, email, password, role: userRole, phoneNumber } = body;

    if (!fullName || !email || !password || !userRole) {
      return NextResponse.json(
        { error: "fullName, email, password, and role are required" },
        { status: 400 }
      );
    }

    return await withClient(async (client) => {
      const existing = await client.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email.trim()]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const insertRes = await client.query(
        `INSERT INTO users (tenant_id, full_name, email, password_hash, role, phone_number, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, full_name as "fullName", email, phone_number as "phoneNumber",
                   role, is_active as "isActive", created_at as "createdAt"`,
        [tenantId, fullName.trim(), email.trim(), passwordHash, userRole, phoneNumber ? phoneNumber.trim() : null]
      );

      return NextResponse.json({ user: insertRes.rows[0] }, { status: 201 });
    });
  } catch (error) {
    console.error("[TEAM POST]", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
