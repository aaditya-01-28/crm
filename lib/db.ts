import { Client } from "pg";

export async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const forceSsl = connectionString.includes("sslmode=require") || connectionString.includes("ssl=true");
  const ssl = forceSsl ? { rejectUnauthorized: false } : isLocal ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false);

  const client = new Client({
    connectionString,
    ssl,
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
  return withClient(async (client) => {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;`).catch(() => {});
    const res = await client.query<{
      id: string;
      tenantId: string;
      fullName: string;
      email: string;
      passwordHash: string;
      phoneNumber: string | null;
      role: string;
      isActive: boolean;
      avatarUrl: string | null;
      mustChangePassword: boolean;
      tenantName: string;
    }>(
      `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
              u.email, u.password_hash as "passwordHash", u.phone_number as "phoneNumber",
              u.role, u.is_active as "isActive", u.avatar_url as "avatarUrl",
              COALESCE(u.must_change_password, false) as "mustChangePassword", o.name as "tenantName"
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
      avatarUrl: r.avatarUrl || null,
      mustChangePassword: Boolean(r.mustChangePassword),
      tenant: {
        name: r.tenantName,
      },
    };
  });
}
