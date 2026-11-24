import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date?: string | Date | null): string {
  if (!date) return "Date & time TBD";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Date & time TBD";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Converts any local datetime-local string (e.g. "2026-11-24T18:25")
 * or Date object to an unambiguous UTC ISO-8601 string (ending in 'Z').
 * Prevents timezone double-offset bugs between client browsers and server environments.
 */
export function toUtcIsoString(input?: string | Date | null): string | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input.toISOString();
  }
  const str = typeof input === "string" ? input.trim() : String(input).trim();
  if (!str) return null;

  // If already has explicit UTC or offset (Z or +05:30), parse directly
  if (str.endsWith("Z") || /[+-]\d{2}(:?\d{2})?$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Bare datetime-local format from HTML input: "YYYY-MM-DDTHH:mm"
  // In client browser, new Date(str) interprets in local user timezone
  const localParsed = new Date(str);
  if (!isNaN(localParsed.getTime())) {
    return localParsed.toISOString();
  }

  return null;
}

/**
 * Universal server/client date parser for scheduled tasks and meetings.
 * If given a bare local string without timezone offset (e.g. "2026-11-24T18:25"),
 * safely treats it as Indian Standard Time (IST, UTC+05:30) rather than server UTC,
 * preventing local meeting times from shifting forward by 5h 30m.
 */
export function parseScheduledDateTime(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  const str = typeof input === "string" ? input.trim() : String(input).trim();
  if (!str) return null;

  // If already has explicit UTC or offset (Z or +05:30)
  if (str.endsWith("Z") || /[+-]\d{2}(:?\d{2})?$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // If bare local string like "2026-11-24T18:25" or "2026-11-24 18:25"
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(str)) {
    const normalized = str.replace(" ", "T");
    const withOffset = normalized.length === 16 ? `${normalized}:00+05:30` : `${normalized}+05:30`;
    const d = new Date(withOffset);
    if (!isNaN(d.getTime())) return d;
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function normalizePhone(raw: string): string {
  // Strip all non-digits
  const digits = raw.replace(/\D/g, "");
  // Handle +91 prefix → take last 10 digits
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export interface WAPitchOptions {
  repName?: string | null;
  repEmail?: string | null;
  repPhone?: string | null;
  contactName?: string | null;
}

export function buildWAPitch(options?: WAPitchOptions): string {
  const name = (options?.repName || "").trim() || "Aaditya";
  const email = (options?.repEmail || "").trim() || "aaditya@textorasms.com";
  let phone = (options?.repPhone || "").trim();
  if (phone) {
    phone = normalizePhone(phone);
  }
  if (!phone) {
    phone = "9902101007";
  }
  const greetingTarget = (options?.contactName || "").trim() || "Sir";

  return `Hello ${greetingTarget} 👋
This is ${name} from Textora Technologies Pvt Ltd.

Looking to grow your business faster and reach more customers instantly? 🚀
We offer smart messaging solutions to boost sales, engagement, and brand visibility 📈

✨ Our Services:
📲 Business WhatsApp API – Official & automated messaging
💬 Virtual WhatsApp – Bulk & personalised campaigns
📩 RCS Messaging – Rich, interactive messages
🔐 Transactional SMS – OTPs, alerts & notifications
📢 Promotional SMS – Offers, campaigns & branding
📞 Voice SMS – Automated voice calls at scale
🌐Website development: Build Premium Websites That Grow Your Business

📢 Reach customers instantly | Improve response rate | Increase conversions

📞 For details & free demo:
${name}
📧 ${email}
https://textorasms.com
📱 ${phone}

Reply YES to get started 👍`;
}

/** Textora standard WhatsApp greeting pitch */
export const WA_PITCH = buildWAPitch();

export function buildWALink(phone: string, textOrOptions?: string | WAPitchOptions): string {
  const normalized = normalizePhone(phone);
  const text = typeof textOrOptions === "string"
    ? textOrOptions
    : buildWAPitch(textOrOptions);
  return `https://wa.me/91${normalized}?text=${encodeURIComponent(text)}`;
}

export function buildTelLink(phone: string): string {
  const normalized = normalizePhone(phone);
  return `tel:+91${normalized}`;
}

export function calculateGST(baseAmount: number): {
  base: number;
  tax: number;
  total: number;
} {
  const tax = Math.round(baseAmount * 0.18 * 100) / 100;
  return {
    base: baseAmount,
    tax,
    total: Math.round((baseAmount + tax) * 100) / 100,
  };
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m 0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

export const SERVICE_INTERESTS = [
  "WhatsApp API",
  "Bulk WhatsApp",
  "Virtual WhatsApp",
  "Bulk SMS",
  "RCS Messaging",
  "Transactional SMS",
  "Promotional SMS",
  "Voice SMS / OBD",
  "OTP API",
  "DLT & SMS Gateway",
  "Combo WA+SMS",
  "Reseller",
];

export function parseServices(serviceStr?: string | null): string[] {
  if (!serviceStr) return [];
  return serviceStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const LEAD_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi (हिन्दी)", flag: "🇮🇳" },
  { code: "ta", label: "Tamil (தமிழ்)", flag: "🇮🇳" },
  { code: "te", label: "Telugu (తెలుగు)", flag: "🇮🇳" },
  { code: "kn", label: "Kannada (ಕನ್ನಡ)", flag: "🇮🇳" },
  { code: "ml", label: "Malayalam (മലയാളം)", flag: "🇮🇳" },
  { code: "mr", label: "Marathi (मराठी)", flag: "🇮🇳" },
  { code: "gu", label: "Gujarati (ગુજરાતી)", flag: "🇮🇳" },
  { code: "bn", label: "Bengali (বাংলা)", flag: "🇮🇳" },
  { code: "pa", label: "Punjabi (ਪੰਜਾਬੀ)", flag: "🇮🇳" },
  { code: "or", label: "Odia (ଓଡ଼ିଆ)", flag: "🇮🇳" },
  { code: "as", label: "Assamese (অসমীয়া)", flag: "🇮🇳" },
  { code: "ur", label: "Urdu (اردو)", flag: "🇮🇳" },
];

export function getLanguageMeta(codeOrName?: string | null) {
  if (!codeOrName) return null;
  const clean = codeOrName.trim().toLowerCase();
  const match = LEAD_LANGUAGES.find(
    (l) =>
      l.code.toLowerCase() === clean ||
      l.label.toLowerCase().includes(clean) ||
      clean.includes(l.code.toLowerCase()) ||
      clean.includes(l.label.toLowerCase().split(" ")[0])
  );
  if (match) return match;
  return { code: codeOrName, label: codeOrName.toUpperCase(), flag: "🌐" };
}

export function parseLanguages(langStr?: string | null): string[] {
  if (!langStr) return [];
  return langStr
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function formatLanguageLabels(langStr?: string | null): string {
  const codes = parseLanguages(langStr);
  if (codes.length === 0) return "";
  return codes
    .map((c) => {
      const meta = getLanguageMeta(c);
      return meta ? `${meta.flag} ${meta.label.split(" (")[0]}` : c.toUpperCase();
    })
    .join(", ");
}

export function hasLanguageMatch(
  repLanguagesStr?: string | null,
  leadLanguageStr?: string | null
): boolean {
  if (!repLanguagesStr || !leadLanguageStr) return false;
  const repLangs = parseLanguages(repLanguagesStr);
  const leadLangs = parseLanguages(leadLanguageStr);
  return leadLangs.some((lang) => repLangs.includes(lang));
}

