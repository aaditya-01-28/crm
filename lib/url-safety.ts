/**
 * Browser- and server-safe sanitization helpers for external URLs and CSV exports.
 * Zero Node-specific imports so client components can import cleanly.
 */

/**
 * Validates external or uploaded resource URLs against an allowlist of schemes.
 * Blocks `javascript:`, `data:`, `vbscript:`, `file:`, and protocol-relative `//` URLs.
 */
export function sanitizeExternalUrl(
  rawUrl: unknown,
  options: { allowRelative?: boolean } = {}
): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === "NA") return null;

  // Reject control characters / whitespace obfuscation (e.g. "java\tscript:")
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  if (options.allowRelative && trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) and applies RFC-4180 quoting.
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(str);
  const safe = needsFormulaGuard ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCsvRow(values: unknown[]): string {
  return values.map((v) => sanitizeCsvCell(v)).join(",");
}
