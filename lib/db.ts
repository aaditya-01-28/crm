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
    const forceSsl = connectionString.includes("sslmode=require") || connectionString.includes("ssl=true") || connectionString.includes("supabase.com");
    const strictCa = process.env.DB_CA_CERT;
    const strictSsl = process.env.DB_STRICT_SSL === "true";
    const ssl = isLocal
      ? false
      : strictCa
      ? { rejectUnauthorized: true, ca: strictCa }
      : forceSsl || process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: strictSsl }
      : false;

    // Strip sslmode from URL so pg-connection-string doesn't override ssl: { rejectUnauthorized: false }
    // (fixes "self-signed certificate in certificate chain" on Supabase pooler)
    const cleanConnectionString = isLocal
      ? connectionString
      : connectionString.replace(/([?&])sslmode=[^&]*(&?)/gi, (_, prefix, suffix) =>
          suffix ? prefix : ""
        ).replace(/[?&]$/, "");

    global._pgPool = new Pool({
      connectionString: cleanConnectionString,
      ssl,
      max: isLocal ? 20 : 3, // Keep per-lambda pool small so serverless concurrency never exhausts Supabase pool_size
      idleTimeoutMillis: isLocal ? 30000 : 5000, // Release idle connections quickly in serverless
      connectionTimeoutMillis: 8000,
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
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_call_target INTEGER DEFAULT 60;`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;`);
    await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS log_source TEXT DEFAULT 'dialer_web';`);
    await client.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT NULL;`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_interested BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS task_source TEXT DEFAULT 'dialer';`);
    await client.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_stage_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        lead_id UUID NOT NULL,
        rep_id UUID,
        stage_name VARCHAR(100) NOT NULL,
        stage_type VARCHAR(50) NOT NULL,
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ(6) DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_lead_stage_history_tenant ON lead_stage_history(tenant_id, lead_id, created_at DESC);
    `);

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
              u.phone_number as "phoneNumber",
              u.avatar_url as "avatarUrl",
              COALESCE(u.must_change_password, false) as "mustChangePassword",
              COALESCE(u.token_version, 1)::int as "tokenVersion",
              u.previous_login_at as "previousLoginAt",
              u.last_login_at as "lastLoginAt",
              o.name as "tenantName",
              COALESCE(o.is_active, true) as "orgIsActive"
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
      phoneNumber: r.phoneNumber || null,
      avatarUrl: r.avatarUrl || null,
      mustChangePassword: Boolean(r.mustChangePassword),
      tokenVersion: Number(r.tokenVersion ?? 1),
      orgIsActive: Boolean(r.orgIsActive ?? true),
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
      tokenVersion: number;
      orgIsActive: boolean;
      previousLoginAt: Date | null;
      lastLoginAt: Date | null;
      tenantName: string;
    }>(
      `SELECT u.id, u.tenant_id as "tenantId", u.full_name as "fullName",
              u.email, u.password_hash as "passwordHash", u.phone_number as "phoneNumber",
              u.role, u.is_active as "isActive", u.avatar_url as "avatarUrl",
              COALESCE(u.must_change_password, false) as "mustChangePassword",
              COALESCE(u.token_version, 1)::int as "tokenVersion",
              COALESCE(o.is_active, true) as "orgIsActive",
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
      tokenVersion: Number(r.tokenVersion ?? 1),
      orgIsActive: Boolean(r.orgIsActive ?? true),
      previousLoginAt: r.previousLoginAt ? new Date(r.previousLoginAt).toISOString() : null,
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
      tenant: {
        name: r.tenantName,
      },
    };
  });
}
