import { Client } from "pg";

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withClient(async (client) => {
    const res = await client.query(sql, params);
    return res.rows as T[];
  });
}

export async function queryUserByEmail(email: string) {
  const rows = await query<{
    id: string;
    tenantId: string;
    fullName: string;
    email: string;
    passwordHash: string;
    phoneNumber: string | null;
    role: string;
    isActive: boolean;
    tenantName: string;
  }>(
    `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
            u.email, u.password_hash as "passwordHash", u.phone_number as "phoneNumber",
            u.role, u.is_active as "isActive", o.name as "tenantName"
     FROM users u
     JOIN organizations o ON u.tenant_id = o.id
     WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
    [email]
  );

  if (rows.length === 0) return null;
  const r = rows[0];

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
