import { Pool } from "pg";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function queryUserByEmail(email: string) {
  const p = getPool();
  const res = await p.query(
    `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
            u.email, u.password_hash as "passwordHash", u.phone_number as "phoneNumber",
            u.role, u.is_active as "isActive", o.name as "tenantName"
     FROM users u
     JOIN organizations o ON u.tenant_id = o.id
     WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
    [email]
  );

  if (res.rows.length === 0) return null;
  const r = res.rows[0];

  return {
    id: r.id,
    tenantId: r.tenantId,
    fullName: r.fullName,
    email: r.email,
    passwordHash: r.passwordHash,
    phoneNumber: r.phoneNumber,
    role: r.role,
    isActive: r.isActive,
    tenant: {
      name: r.tenantName,
    },
  };
}
