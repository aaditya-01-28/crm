import type { PoolClient } from "pg";

export interface DealSplitInput {
  enabled?: boolean;
  primaryRepId?: string | null;
  primaryPercentage?: number;
  partnerRepId?: string | null;
  partnerPercentage?: number;
}

export interface DealSplitRecord {
  id?: string;
  dealId?: string;
  repId: string;
  repName?: string;
  percentage: number;
  isPrimary: boolean;
  status: string;
}

export async function ensureDealSplitsTable(client: PoolClient): Promise<void> {
  await client
    .query(`
      CREATE TABLE IF NOT EXISTS deal_splits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        rep_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        percentage NUMERIC(5,2) NOT NULL,
        is_primary BOOLEAN DEFAULT false,
        status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
        created_at TIMESTAMPTZ(6) DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_deal_splits_deal ON deal_splits(deal_id);
      CREATE INDEX IF NOT EXISTS idx_deal_splits_rep ON deal_splits(rep_id, status);
    `)
    .catch(() => {});
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and persists a 2-rep percentage split on a deal.
 * If split is disabled or invalid, removes any split rows so 100% stays on deals.rep_id.
 */
export async function syncDealSplits(params: {
  client: PoolClient;
  tenantId: string;
  dealId: string;
  fallbackPrimaryRepId: string;
  splitConfig?: DealSplitInput | null;
  status: string;
}): Promise<DealSplitRecord[]> {
  const { client, tenantId, dealId, fallbackPrimaryRepId, splitConfig, status } = params;
  await ensureDealSplitsTable(client);

  if (!splitConfig || !splitConfig.enabled || !splitConfig.partnerRepId) {
    await client.query(`DELETE FROM deal_splits WHERE deal_id = $1 AND tenant_id = $2`, [
      dealId,
      tenantId,
    ]);
    return [];
  }

  const primaryRepId =
    splitConfig.primaryRepId && UUID_REGEX.test(splitConfig.primaryRepId)
      ? splitConfig.primaryRepId
      : fallbackPrimaryRepId;
  const partnerRepId = splitConfig.partnerRepId;

  if (!UUID_REGEX.test(primaryRepId) || !UUID_REGEX.test(partnerRepId) || primaryRepId === partnerRepId) {
    throw new Error("Split partner must be a different valid team member.");
  }

  // Verify both split reps belong to this tenant and are active
  const validUsersRes = await client.query(
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = true`,
    [[primaryRepId, partnerRepId], tenantId]
  );
  if (validUsersRes.rows.length !== 2) {
    throw new Error("Split representatives must both belong to the active organization workspace.");
  }

  const pPct = Number(splitConfig.primaryPercentage);
  const sPct = Number(splitConfig.partnerPercentage);
  if (
    !Number.isFinite(pPct) ||
    !Number.isFinite(sPct) ||
    pPct <= 0 ||
    sPct <= 0 ||
    Math.abs(pPct + sPct - 100) > 0.05
  ) {
    throw new Error("Split percentages must both be greater than 0 and add up to 100%.");
  }

  await client.query(`DELETE FROM deal_splits WHERE deal_id = $1 AND tenant_id = $2`, [
    dealId,
    tenantId,
  ]);

  await client.query(
    `INSERT INTO deal_splits (tenant_id, deal_id, rep_id, percentage, is_primary, status, created_at)
     VALUES
       ($1::uuid, $2::uuid, $3::uuid, $4::numeric, true, $7::varchar, NOW()),
       ($1::uuid, $2::uuid, $5::uuid, $6::numeric, false, $7::varchar, NOW())`,
    [tenantId, dealId, primaryRepId, pPct, partnerRepId, sPct, status]
  );

  const inserted = await client.query(
    `SELECT ds.id, ds.deal_id as "dealId", ds.rep_id as "repId",
            u.full_name as "repName", ds.percentage::float8 as percentage,
            ds.is_primary as "isPrimary", ds.status
     FROM deal_splits ds
     LEFT JOIN users u ON ds.rep_id = u.id AND u.tenant_id = ds.tenant_id
     WHERE ds.deal_id = $1 AND ds.tenant_id = $2
     ORDER BY ds.is_primary DESC, ds.percentage DESC`,
    [dealId, tenantId]
  );

  return inserted.rows;
}

/**
 * SQL CTE producing effective per-rep deal allocations `(deal_id, rep_id, share_ratio, percentage, is_split, is_primary)`:
 * - For deals with approved `deal_splits` rows: emits one row per split rep with `percentage / 100.0`.
 * - For all other deals (unsplit, or pending/rejected split): emits a single row for `deals.rep_id` with `share_ratio = 1.0`.
 */
export function effectiveDealSharesCte(): string {
  return `
    effective_deal_shares AS (
      SELECT d.id as deal_id,
             COALESCE(ds.rep_id, d.rep_id) as rep_id,
             CASE WHEN ds.id IS NOT NULL THEN (ds.percentage / 100.0) ELSE 1.0 END as share_ratio,
             CASE WHEN ds.id IS NOT NULL THEN ds.percentage::float8 ELSE 100.0 END as percentage,
             (ds.id IS NOT NULL) as is_split,
             COALESCE(ds.is_primary, true) as is_primary
      FROM deals d
      LEFT JOIN deal_splits ds
        ON ds.deal_id = d.id
       AND ds.tenant_id = d.tenant_id
       AND ds.status = 'approved'
       AND EXISTS (
         SELECT 1 FROM deal_splits ds_chk
         WHERE ds_chk.deal_id = d.id AND ds_chk.tenant_id = d.tenant_id AND ds_chk.status = 'approved'
       )
      WHERE d.tenant_id = $1
    )
  `;
}
