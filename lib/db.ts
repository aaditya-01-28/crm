import { Pool, PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _dbSchemaInitialized: boolean | undefined;
}

function getPool(): Pool {
  if (!global._pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    const forceSsl = connectionString.includes("sslmode=require") || connectionString.includes("ssl=true");
    const ssl = forceSsl ? { rejectUnauthorized: false } : isLocal ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false);

    global._pgPool = new Pool({
      connectionString,
      ssl,
      max: 20, // Maintain up to 20 hot, ready connections
      idleTimeoutMillis: 30000, // Reclaim idle connection after 30s
      connectionTimeoutMillis: 5000,
    });
  }
  return global._pgPool;
}

async function ensureCoreSchema(client: PoolClient) {
  if (global._dbSchemaInitialized) return;
  try {
    // 1. Column migrations
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_login_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT NULL;`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';`);

    // 2. Push to dial table & composite index
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
    `);

    // 3. Performance composite indexes for rapid polling and queries
    await client.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_rep_time ON call_logs (tenant_id, rep_id, call_timestamp DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_lead_time ON call_logs (tenant_id, lead_id, call_timestamp DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_time ON call_logs (tenant_id, call_timestamp DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_rep_status ON leads (tenant_id, assigned_rep_id, status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads (tenant_id, status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_rep_time ON scheduled_tasks (tenant_id, rep_id, status, scheduled_time);`);

    global._dbSchemaInitialized = true;
  } catch (err: any) {
    console.warn("[DB_INIT] Non-fatal schema migration warning:", err?.message);
    global._dbSchemaInitialized = true;
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    if (!global._dbSchemaInitialized) {
      await ensureCoreSchema(client);
    }
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withClient(async (client) => {
    const res = await client.query(sql, params);
    return res.rows as T[];
  });
}

export async function queryUserById(id: string) {
  return withClient(async (client) => {
    const res = await client.query(
      `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
              u.email, u.role, u.is_active as "isActive",
              u.avatar_url as "avatarUrl",
              COALESCE(u.must_change_password, false) as "mustChangePassword",
              u.previous_login_at as "previousLoginAt",
              u.last_login_at as "lastLoginAt",
              o.name as "tenantName"
       FROM users u
       JOIN organizations o ON u.tenant_id = o.id
       WHERE u.id = $1 LIMIT 1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenantId,
      fullName: r.fullName,
      email: r.email,
      role: r.role,
      isActive: r.isActive,
      avatarUrl: r.avatarUrl || null,
      mustChangePassword: Boolean(r.mustChangePassword),
      previousLoginAt: r.previousLoginAt ? new Date(r.previousLoginAt).toISOString() : null,
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
      tenant: { name: r.tenantName },
    };
  });
}

export async function queryUserByEmail(email: string) {
  return withClient(async (client) => {
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
      previousLoginAt: Date | null;
      lastLoginAt: Date | null;
      tenantName: string;
    }>(
      `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
              u.email, u.password_hash as "passwordHash", u.phone_number as "phoneNumber",
              u.role, u.is_active as "isActive", u.avatar_url as "avatarUrl",
              COALESCE(u.must_change_password, false) as "mustChangePassword",
              u.previous_login_at as "previousLoginAt",
              u.last_login_at as "lastLoginAt", o.name as "tenantName"
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
      previousLoginAt: r.previousLoginAt ? new Date(r.previousLoginAt).toISOString() : null,
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
      tenant: {
        name: r.tenantName,
      },
    };
  });
}
