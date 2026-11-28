import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { signAccessToken } from "../lib/auth";
import { POST as registerPost } from "../app/api/auth/register/route";
import { POST as forgotPasswordPost } from "../app/api/auth/forgot-password/route";
import { POST as resetPasswordPost } from "../app/api/auth/reset-password/route";
import { POST as updatePasswordPost } from "../app/api/auth/update-password/route";
import { POST as callsPost } from "../app/api/calls/route";
import { PATCH as leadPatch, DELETE as leadDelete } from "../app/api/leads/[id]/route";
import { POST as bulkAssignPost } from "../app/api/leads/bulk-assign/route";
import { PATCH as paymentApprovePatch } from "../app/api/payments/[id]/approve/route";
import { PATCH as dealPatch } from "../app/api/deals/[id]/route";
import { GET as eodReportGet } from "../app/api/reports/eod/route";
import { GET as dashboardStatsGet } from "../app/api/dashboard/stats/route";
import { PATCH as profilePatch } from "../app/api/profile/route";
import { POST as recordingPost } from "../app/api/telephony/recordings/route";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_ADMIN_A = "aaaa1111-1111-4111-8111-111111111111";
const USER_MANAGER_A = "bbbb1111-1111-4111-8111-111111111111";
const USER_REP_A = "cccc1111-1111-4111-8111-111111111111";
const USER_OPS_A = "dddd1111-1111-4111-8111-111111111111";
const LEAD_A = "eeee1111-1111-4111-8111-111111111111";
const LEAD_B = "ffff2222-2222-4222-8222-222222222222";
const DEAL_A = "99991111-1111-4111-8111-111111111111";
const PAYMENT_A = "88881111-1111-4111-8111-111111111111";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

type QueryHandler = (sql: string, params: unknown[]) => { rows: any[]; rowCount?: number };

let recordedQueries: RecordedQuery[] = [];
let activeUserOverrides: Record<string, Partial<Record<string, any>>> = {};
let customQueryHandler: QueryHandler | null = null;

function defaultUsersMap(): Record<string, any> {
  return {
    [USER_ADMIN_A]: {
      id: USER_ADMIN_A,
      tenantId: TENANT_A,
      fullName: "Admin A",
      email: "admin@tenanta.example",
      phoneNumber: "9000000001",
      role: "super_admin",
      isActive: true,
      orgIsActive: true,
      mustChangePassword: false,
      tokenVersion: 1,
      language: "en",
      avatarUrl: null,
      orgId: TENANT_A,
      orgName: "Tenant A",
      orgPlanTier: "pro",
    },
    [USER_MANAGER_A]: {
      id: USER_MANAGER_A,
      tenantId: TENANT_A,
      fullName: "Manager A",
      email: "manager@tenanta.example",
      phoneNumber: "9000000002",
      role: "sales_manager",
      isActive: true,
      orgIsActive: true,
      mustChangePassword: false,
      tokenVersion: 1,
      language: "en",
      avatarUrl: null,
      orgId: TENANT_A,
      orgName: "Tenant A",
      orgPlanTier: "pro",
    },
    [USER_REP_A]: {
      id: USER_REP_A,
      tenantId: TENANT_A,
      fullName: "Rep A",
      email: "rep@tenanta.example",
      phoneNumber: "9000000003",
      role: "sales_rep",
      isActive: true,
      orgIsActive: true,
      mustChangePassword: false,
      tokenVersion: 1,
      language: "en",
      avatarUrl: null,
      orgId: TENANT_A,
      orgName: "Tenant A",
      orgPlanTier: "pro",
    },
    [USER_OPS_A]: {
      id: USER_OPS_A,
      tenantId: TENANT_A,
      fullName: "Ops A",
      email: "ops@tenanta.example",
      phoneNumber: "9000000004",
      role: "accounts_ops",
      isActive: true,
      orgIsActive: true,
      mustChangePassword: false,
      tokenVersion: 1,
      language: "en",
      avatarUrl: null,
      orgId: TENANT_A,
      orgName: "Tenant A",
      orgPlanTier: "pro",
    },
  };
}

function installFakePool() {
  globalThis._dbSchemaInitialized = true;
  globalThis._pgPool = {
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        const trimmed = sql.trim();
        recordedQueries.push({ sql: trimmed, params });

        if (
          trimmed === "BEGIN" ||
          trimmed === "COMMIT" ||
          trimmed === "ROLLBACK" ||
          trimmed.startsWith("CREATE TABLE IF NOT EXISTS")
        ) {
          return { rows: [], rowCount: 0 };
        }

        // Handle queryUserById from requireActiveSession()
        if (
          trimmed.includes("FROM users u") &&
          trimmed.includes("JOIN organizations o") &&
          trimmed.includes("WHERE u.id = $1")
        ) {
          const id = String(params[0] ?? "");
          const base = defaultUsersMap()[id];
          if (!base) return { rows: [], rowCount: 0 };
          return { rows: [{ ...base, ...(activeUserOverrides[id] || {}) }], rowCount: 1 };
        }

        if (customQueryHandler) {
          return customQueryHandler(trimmed, params);
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }),
  } as any;
}

async function makeToken(userId: string, override: Partial<{ role: string; tenantId: string; tokenVersion: number }> = {}) {
  const user = defaultUsersMap()[userId];
  return signAccessToken({
    sub: userId,
    tenantId: override.tenantId ?? user.tenantId,
    role: override.role ?? user.role,
    email: user.email,
    fullName: user.fullName,
    tokenVersion: override.tokenVersion ?? 1,
  });
}

function makeJsonReq(url: string, method: string, body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200) + 1}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("API Route Security & Multi-Tenancy Regression Suite", () => {
  beforeEach(() => {
    recordedQueries = [];
    activeUserOverrides = {};
    customQueryHandler = null;
    delete process.env.ALLOW_PUBLIC_REGISTRATION;
    delete process.env.PLATFORM_PROVISION_SECRET;
    installFakePool();
  });

  describe("Auth Hardening", () => {
    it("blocks public registration with 403 when ALLOW_PUBLIC_REGISTRATION is not enabled", async () => {
      const req = makeJsonReq("http://localhost/api/auth/register", "POST", {
        orgName: "Evil Corp",
        fullName: "Attacker",
        email: "evil@example.com",
        password: "StrongPassword123!",
      });
      const res = await registerPost(req);
      assert.equal(res.status, 403);
    });

    it("returns uniform 200 on forgot-password without leaking role or existence", async () => {
      customQueryHandler = () => ({ rows: [], rowCount: 0 });
      const resUnknown = await forgotPasswordPost(
        makeJsonReq("http://localhost/api/auth/forgot-password", "POST", { email: "nobody@example.com" })
      );
      const dataUnknown = await resUnknown.json();
      assert.equal(resUnknown.status, 200);
      assert.equal(dataUnknown.success, true);
      assert.equal("isSuperAdmin" in dataUnknown, false);
      assert.equal("isRequestRaised" in dataUnknown, false);
    });

    it("rejects weak password on reset-password and hashes lookup token", async () => {
      const weakRes = await resetPasswordPost(
        makeJsonReq("http://localhost/api/auth/reset-password", "POST", {
          token: "abcdef1234567890abcdef1234567890",
          newPassword: "short",
        })
      );
      assert.equal(weakRes.status, 400);

      customQueryHandler = () => ({ rows: [], rowCount: 0 });
      const rawToken = "my-raw-reset-token-value-123456";
      const missingRes = await resetPasswordPost(
        makeJsonReq("http://localhost/api/auth/reset-password", "POST", {
          token: rawToken,
          newPassword: "StrongPassword123!",
        })
      );
      assert.equal(missingRes.status, 400);
      const lookup = recordedQueries.find((q) => q.sql.includes("WHERE u.reset_token = $1"));
      assert.ok(lookup);
      assert.notEqual(lookup.params[0], rawToken);
      assert.equal(String(lookup.params[0]).length, 64);
    });

    it("rejects unauthenticated update-password when user is not in mustChangePassword state", async () => {
      const passwordHash = await bcrypt.hash("TempPass123!@#", 10);
      customQueryHandler = (sql) => {
        if (sql.includes("FROM users u") && sql.includes("LOWER(u.email)")) {
          return {
            rows: [
              {
                ...defaultUsersMap()[USER_REP_A],
                passwordHash,
                mustChangePassword: false,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      };
      const res = await updatePasswordPost(
        makeJsonReq("http://localhost/api/auth/update-password", "POST", {
          email: "rep@tenanta.example",
          temporaryPassword: "TempPass123!@#",
          newPassword: "NewStrongPassword123!",
        })
      );
      assert.equal(res.status, 401);
    });

    it("rejects revoked tokenVersion and suspended org sessions", async () => {
      activeUserOverrides[USER_REP_A] = { tokenVersion: 2 };
      const staleToken = await makeToken(USER_REP_A, { tokenVersion: 1 });
      const resRevoked = await eodReportGet(
        makeJsonReq("http://localhost/api/reports/eod", "GET", undefined, staleToken)
      );
      assert.equal(resRevoked.status, 401);

      activeUserOverrides[USER_REP_A] = { tokenVersion: 1, orgIsActive: false };
      const activeToken = await makeToken(USER_REP_A, { tokenVersion: 1 });
      const resSuspended = await eodReportGet(
        makeJsonReq("http://localhost/api/reports/eod", "GET", undefined, activeToken)
      );
      assert.equal(resSuspended.status, 401);
    });
  });

  describe("Cross-Tenant Isolation & Header Spoofing Defense", () => {
    it("ignores spoofed x-tenant-id / x-user-id on POST /api/calls and rejects cross-tenant leadId", async () => {
      const token = await makeToken(USER_REP_A);
      customQueryHandler = (sql, params) => {
        if (sql.includes("SELECT id, assigned_rep_id FROM leads WHERE id = $1 AND tenant_id = $2")) {
          // Only LEAD_A belongs to TENANT_A; LEAD_B belongs to TENANT_B
          assert.equal(params[1], TENANT_A);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      };

      const res = await callsPost(
        makeJsonReq(
          "http://localhost/api/calls",
          "POST",
          { leadId: LEAD_B, phoneNumber: "9876543210", durationSeconds: 20 },
          token,
          { "x-tenant-id": TENANT_B, "x-user-id": "99999999-9999-4999-8999-999999999999" }
        )
      );
      assert.equal(res.status, 404);
      const insertCalled = recordedQueries.some((q) => q.sql.includes("INSERT INTO call_logs"));
      assert.equal(insertCalled, false);
    });

    it("verifies tenant ownership before deleting child rows on DELETE /api/leads/[id]", async () => {
      const adminToken = await makeToken(USER_ADMIN_A);
      customQueryHandler = (sql, params) => {
        if (sql.includes("SELECT id FROM leads WHERE id = $1 AND tenant_id = $2")) {
          assert.equal(params[0], LEAD_B);
          assert.equal(params[1], TENANT_A);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      };

      const res = await leadDelete(
        makeJsonReq(
          `http://localhost/api/leads/${LEAD_B}`,
          "DELETE",
          undefined,
          adminToken,
          { "x-tenant-id": TENANT_B, "x-user-role": "super_admin" }
        ),
        { params: Promise.resolve({ id: LEAD_B }) }
      );
      assert.equal(res.status, 404);
      const deletedAnyChild = recordedQueries.some((q) => q.sql.startsWith("DELETE FROM"));
      assert.equal(deletedAnyChild, false);
    });

    it("rejects cross-tenant repIds in POST /api/leads/bulk-assign", async () => {
      const managerToken = await makeToken(USER_MANAGER_A);
      customQueryHandler = (sql, params) => {
        if (sql.includes("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND tenant_id = $2")) {
          assert.equal(params[1], TENANT_A);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      };

      const res = await bulkAssignPost(
        makeJsonReq(
          "http://localhost/api/leads/bulk-assign",
          "POST",
          {
            mode: "round_robin",
            leadIds: [LEAD_A],
            repIds: ["77777777-7777-4777-8777-777777777777"],
          },
          managerToken
        )
      );
      assert.equal(res.status, 400);
    });
  });

  describe("RBAC & Financial Integrity", () => {
    it("blocks accounts_ops from viewing EOD reports (403) and strips sales metrics from dashboard stats", async () => {
      const opsToken = await makeToken(USER_OPS_A);

      const eodRes = await eodReportGet(
        makeJsonReq("http://localhost/api/reports/eod", "GET", undefined, opsToken)
      );
      assert.equal(eodRes.status, 403);

      customQueryHandler = (sql) => {
        if (sql.includes("COUNT(id)::int as count")) {
          return { rows: [{ count: 3, value: 15000 }], rowCount: 1 };
        }
        if (sql.includes('"verifiedRevenue"')) {
          return { rows: [{ verifiedRevenue: 50000 }], rowCount: 1 };
        }
        if (sql.includes('"allTimeVerified"')) {
          return { rows: [{ allTimeVerified: 120000, allTimePending: 15000 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      };

      const dashRes = await dashboardStatsGet(
        makeJsonReq("http://localhost/api/dashboard/stats", "GET", undefined, opsToken)
      );
      assert.equal(dashRes.status, 200);
      const dashBody = await dashRes.json();
      assert.equal(dashBody.metrics.verifiedRevenue, 50000);
      assert.equal(dashBody.metrics.totalCalls, 0);
      assert.deepEqual(dashBody.teamMembers, []);
    });

    it("blocks sales_manager from approving payments (403) and blocks double approval (409)", async () => {
      const managerToken = await makeToken(USER_MANAGER_A);
      const managerRes = await paymentApprovePatch(
        makeJsonReq(`http://localhost/api/payments/${PAYMENT_A}/approve`, "PATCH", { status: "approved" }, managerToken),
        { params: Promise.resolve({ id: PAYMENT_A }) }
      );
      assert.equal(managerRes.status, 403);

      const opsToken = await makeToken(USER_OPS_A);
      customQueryHandler = (sql) => {
        if (sql.includes("FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE")) {
          return {
            rows: [{ id: PAYMENT_A, deal_id: DEAL_A, lead_id: LEAD_A, payment_mode: "UPI", ops_approval_status: "approved" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      };
      const doubleRes = await paymentApprovePatch(
        makeJsonReq(`http://localhost/api/payments/${PAYMENT_A}/approve`, "PATCH", { status: "approved" }, opsToken),
        { params: Promise.resolve({ id: PAYMENT_A }) }
      );
      assert.equal(doubleRes.status, 409);
    });

    it("blocks sales_rep from marking leads won directly or mutating deal commercials", async () => {
      const repToken = await makeToken(USER_REP_A);
      const leadWonRes = await leadPatch(
        makeJsonReq(`http://localhost/api/leads/${LEAD_A}`, "PATCH", { status: "won" }, repToken),
        { params: Promise.resolve({ id: LEAD_A }) }
      );
      assert.equal(leadWonRes.status, 403);

      customQueryHandler = (sql) => {
        if (sql.includes("FROM deals WHERE id = $1 AND tenant_id = $2 FOR UPDATE")) {
          return {
            rows: [{ id: DEAL_A, lead_id: LEAD_A, rep_id: USER_REP_A, stage: "payment_pending", quoted_price: 5000, service_type: "SMS", quantity: 10000 }],
            rowCount: 1,
          };
        }
        if (sql.includes("FROM payments WHERE deal_id = $1 AND tenant_id = $2")) {
          return { rows: [{ id: PAYMENT_A, ops_approval_status: "pending_verification" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      };

      const dealEditRes = await dealPatch(
        makeJsonReq(
          `http://localhost/api/deals/${DEAL_A}`,
          "PATCH",
          { quotedPrice: 1, wonDetails: { finalAmount: 1 } },
          repToken
        ),
        { params: Promise.resolve({ id: DEAL_A }) }
      );
      assert.equal(dealEditRes.status, 403);
    });

    it("preserves non-admin phoneNumber on PATCH /api/profile and rejects unsafe avatarUrl", async () => {
      const repToken = await makeToken(USER_REP_A);

      const xssRes = await profilePatch(
        makeJsonReq("http://localhost/api/profile", "PATCH", { avatarUrl: "javascript:alert(1)" }, repToken)
      );
      assert.equal(xssRes.status, 400);

      customQueryHandler = (sql, params) => {
        if (sql.includes("SELECT u.id, u.tenant_id") && sql.includes("WHERE u.id = $1 AND u.tenant_id = $2")) {
          return { rows: [defaultUsersMap()[USER_REP_A]], rowCount: 1 };
        }
        if (sql.includes("UPDATE users") && sql.includes("SET full_name = $1, phone_number = $2")) {
          // Phone number must remain 9000000003 even though body tried to overwrite it
          assert.equal(params[1], "9000000003");
          return {
            rows: [{ ...defaultUsersMap()[USER_REP_A], fullName: params[0], phoneNumber: params[1] }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      };

      const okRes = await profilePatch(
        makeJsonReq(
          "http://localhost/api/profile",
          "PATCH",
          { fullName: "Rep A Updated", phoneNumber: "1111111111" },
          repToken
        )
      );
      assert.equal(okRes.status, 200);
    });

    it("rejects disallowed audio extensions on POST /api/telephony/recordings", async () => {
      const repToken = await makeToken(USER_REP_A);
      const form = new FormData();
      form.append("file", new File(["<script>alert(1)</script>"], "evil.html", { type: "text/html" }));

      const req = new NextRequest("http://localhost/api/telephony/recordings", {
        method: "POST",
        headers: { Authorization: `Bearer ${repToken}` },
        body: form,
      });
      const res = await recordingPost(req);
      assert.equal(res.status, 400);
    });
  });
});
