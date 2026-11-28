import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidUuid,
  filterValidUuids,
  escapeLikePattern,
  sanitizeExternalUrl,
  sanitizeCsvCell,
  buildCsvRow,
  validateStrongPassword,
  hashResetToken,
  escapeHtml,
  checkRateLimit,
} from "../lib/security";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  validateSessionRecord,
} from "../lib/auth";
import { can, normalizeRole, isAdmin } from "../lib/rbac";

describe("Security Helpers", () => {
  it("validates UUIDs strictly and rejects SQL/malformed IDs", () => {
    assert.equal(isValidUuid("550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(isValidUuid("not-a-uuid"), false);
    assert.equal(isValidUuid("550e8400-e29b-41d4-a716-446655440000' OR 1=1"), false);
    assert.deepEqual(
      filterValidUuids(["550e8400-e29b-41d4-a716-446655440000", "bad", null, 123]),
      ["550e8400-e29b-41d4-a716-446655440000"]
    );
  });

  it("escapes SQL LIKE/ILIKE wildcard characters", () => {
    assert.equal(escapeLikePattern("100%_test\\path"), "100\\%\\_test\\\\path");
  });

  it("blocks javascript:, data:, and protocol-relative XSS URLs", () => {
    assert.equal(sanitizeExternalUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeExternalUrl("java\tscript:alert(1)"), null);
    assert.equal(sanitizeExternalUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(sanitizeExternalUrl("//evil.example/payload"), null);
    assert.equal(sanitizeExternalUrl("/recordings/a.m4a"), null);
    assert.equal(sanitizeExternalUrl("/recordings/a.m4a", { allowRelative: true }), "/recordings/a.m4a");
    assert.equal(sanitizeExternalUrl("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  });

  it("neutralizes CSV formula injection (CWE-1236) and escapes quotes", () => {
    assert.equal(sanitizeCsvCell("=CMD|'/C calc'!A0"), `"'=CMD|'/C calc'!A0"`);
    assert.equal(sanitizeCsvCell("+12345"), `"'+12345"`);
    assert.equal(sanitizeCsvCell("-1+1"), `"'-1+1"`);
    assert.equal(sanitizeCsvCell("@SUM(A1:A2)"), `"'@SUM(A1:A2)"`);
    assert.equal(sanitizeCsvCell("\t=1"), `"'\t=1"`);
    assert.equal(sanitizeCsvCell('Acme "VIP" Corp'), `"Acme ""VIP"" Corp"`);
    assert.equal(buildCsvRow(["Normal", "=1+1", 'Say "Hi"']), `"Normal","'=1+1","Say ""Hi"""`);
  });

  it("enforces strong password policy (>= 12 chars and 3 character classes)", () => {
    assert.equal(validateStrongPassword("123456").valid, false);
    assert.equal(validateStrongPassword("abcdefghijkl").valid, false);
    assert.equal(validateStrongPassword("Abcdefgh1234").valid, true);
    assert.equal(validateStrongPassword("Textora@Ab12!").valid, true);
  });

  it("hashes reset tokens deterministically with SHA-256", () => {
    const raw = "secret-token-value";
    const h1 = hashResetToken(raw);
    const h2 = hashResetToken(raw);
    assert.equal(h1.length, 64);
    assert.equal(h1, h2);
    assert.notEqual(h1, raw);
  });

  it("escapes HTML entities in email templates", () => {
    assert.equal(escapeHtml('<script>"test" & \'x\'</script>'), "&lt;script&gt;&quot;test&quot; &amp; &#39;x&#39;&lt;/script&gt;");
  });

  it("enforces sliding rate limit threshold", () => {
    const key = `test-rate-${Date.now()}`;
    assert.equal(checkRateLimit(key, 2, 60_000).allowed, true);
    assert.equal(checkRateLimit(key, 2, 60_000).allowed, true);
    const third = checkRateLimit(key, 2, 60_000);
    assert.equal(third.allowed, false);
    assert.ok(third.retryAfterSeconds >= 1);
  });
});

describe("Auth & Session Security", () => {
  it("prevents refresh tokens from being accepted as access tokens and vice versa", async () => {
    const payload = {
      sub: "550e8400-e29b-41d4-a716-446655440001",
      tenantId: "550e8400-e29b-41d4-a716-446655440002",
      role: "sales_rep",
      email: "rep@example.com",
      fullName: "Rep One",
      tokenVersion: 1,
    };
    const access = await signAccessToken(payload);
    const refresh = await signRefreshToken(payload);

    assert.ok(await verifyToken(access, "access"));
    assert.equal(await verifyToken(refresh, "access"), null);
    assert.equal(await verifyToken(access, "refresh"), null);
    assert.ok(await verifyToken(refresh, "refresh"));
  });

  it("rejects suspended users, suspended organizations, and revoked token versions", () => {
    const session = {
      sub: "u1",
      tenantId: "t1",
      role: "super_admin",
      email: "a@b.com",
      fullName: "Admin",
      tokenVersion: 1,
    };

    // Active user + active org + matching tokenVersion -> allowed, authoritative DB role returned
    const ok = validateSessionRecord(session, {
      id: "u1",
      tenantId: "t1",
      role: "sales_rep", // demoted in DB
      isActive: true,
      tokenVersion: 1,
      orgIsActive: true,
    });
    assert.equal(ok?.role, "sales_rep");

    // Deactivated user -> rejected
    assert.equal(
      validateSessionRecord(session, {
        id: "u1",
        tenantId: "t1",
        role: "super_admin",
        isActive: false,
        tokenVersion: 1,
        orgIsActive: true,
      }),
      null
    );

    // Suspended organization -> rejected
    assert.equal(
      validateSessionRecord(session, {
        id: "u1",
        tenantId: "t1",
        role: "super_admin",
        isActive: true,
        tokenVersion: 1,
        orgIsActive: false,
      }),
      null
    );

    // Token version incremented on logout/password reset -> rejected
    assert.equal(
      validateSessionRecord(session, {
        id: "u1",
        tenantId: "t1",
        role: "super_admin",
        isActive: true,
        tokenVersion: 2,
        orgIsActive: true,
      }),
      null
    );
  });
});

describe("RBAC Matrix", () => {
  it("enforces strict role permissions", () => {
    assert.equal(can("accounts_ops", "payments:approve"), true);
    assert.equal(can("super_admin", "payments:approve"), true);
    assert.equal(can("sales_manager", "payments:approve"), false);
    assert.equal(can("sales_rep", "payments:approve"), false);
    assert.equal(can("accounts_ops", "reports:view_all"), false);
    assert.equal(can("sales_manager", "reports:view_all"), true);
    assert.equal(normalizeRole("org_admin"), "super_admin");
    assert.equal(isAdmin("org_admin"), true);
  });
});
