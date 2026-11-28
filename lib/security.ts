import crypto from "crypto";
import type { NextRequest } from "next/server";

export {
  sanitizeExternalUrl,
  sanitizeCsvCell,
  buildCsvRow,
} from "./url-safety";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function filterValidUuids(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const valid: string[] = [];
  for (const item of values) {
    if (isValidUuid(item)) {
      valid.push(item.trim());
    }
  }
  return valid;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const MIN_PASSWORD_LENGTH = 12;

export function validateStrongPassword(password: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: "Password must not exceed 128 characters.",
    };
  }
  let categories = 0;
  if (/[a-z]/.test(password)) categories++;
  if (/[A-Z]/.test(password)) categories++;
  if (/[0-9]/.test(password)) categories++;
  if (/[^a-zA-Z0-9]/.test(password)) categories++;

  if (categories < 3) {
    return {
      valid: false,
      error:
        "Password must include at least 3 of: uppercase letters, lowercase letters, numbers, and special characters.",
    };
  }
  return { valid: true };
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function getTrustedAppBaseUrl(): string {
  const envUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm.textorasms.com";
  return envUrl.replace(/\/+$/, "");
}

export function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Note: In-memory sliding window limiter provides per-isolate protection.
// For multi-worker global enforcement on Cloudflare Workers, back with Durable Objects / KV.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: NextRequest | Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    // Prune stale keys opportunistically to keep Map bounded
    if (rateLimitStore.size > 5000) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (now >= v.resetAt) rateLimitStore.delete(k);
      }
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
