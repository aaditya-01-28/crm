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
    timeZone: "Asia/Kolkata",
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
    timeZone: "Asia/Kolkata",
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
 * Safely anchors bare strings to Indian Standard Time (IST, UTC+05:30)
 * preventing timezone double-offset bugs between client browsers and server environments.
 */
export function toUtcIsoString(input?: string | Date | null): string | null {
  if (!input) return null;
  const d = parseScheduledDateTime(input);
  return d && !isNaN(d.getTime()) ? d.toISOString() : null;
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

/**
 * Returns the current date in Indian Standard Time (IST, UTC+05:30) as YYYY-MM-DD.
 */
export function getISTDateString(d: Date = new Date()): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(d.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().split("T")[0];
}

/**
 * Computes exact start and end UTC timestamps for a given period or custom date range,
 * strictly anchored to Indian Standard Time (IST, UTC+05:30).
 * Prevents UTC midnight mismatch where servers think it is still yesterday between 12:00 AM and 05:30 AM IST.
 */
export function getISTDateRange(
  period: string = "today",
  dateFromParam?: string | null,
  dateToParam?: string | null
): { startOfPeriod: Date; endOfPeriod: Date; istTodayStr: string } {
  const now = new Date();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istTodayStr = istNow.toISOString().split("T")[0]; // e.g. "2026-11-25"

  const [currentYear, currentMonth, currentDay] = istTodayStr.split("-").map(Number);

  const createISTDate = (y: number, m: number, d: number, endOfDay: boolean = false): Date => {
    if (endOfDay) {
      return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS);
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
  };

  const startOfToday = createISTDate(currentYear, currentMonth, currentDay, false);
  const endOfToday = createISTDate(currentYear, currentMonth, currentDay, true);

  let startOfPeriod = startOfToday;
  let endOfPeriod = endOfToday;

  if (period === "all") {
    startOfPeriod = new Date(0);
    endOfPeriod = new Date("2100-01-01T00:00:00.000Z");
  } else if (period === "yesterday") {
    const yDate = new Date(istNow.getTime() - 24 * 60 * 60 * 1000);
    const yYear = yDate.getUTCFullYear();
    const yMonth = yDate.getUTCMonth() + 1;
    const yDay = yDate.getUTCDate();
    startOfPeriod = createISTDate(yYear, yMonth, yDay, false);
    endOfPeriod = createISTDate(yYear, yMonth, yDay, true);
  } else if (period === "week") {
    const p7Date = new Date(istNow.getTime() - 6 * 24 * 60 * 60 * 1000);
    const p7Year = p7Date.getUTCFullYear();
    const p7Month = p7Date.getUTCMonth() + 1;
    const p7Day = p7Date.getUTCDate();
    startOfPeriod = createISTDate(p7Year, p7Month, p7Day, false);
    endOfPeriod = endOfToday;
  } else if (period === "month" || period === "this_month" || period === "thisMonth") {
    startOfPeriod = createISTDate(currentYear, currentMonth, 1, false);
    endOfPeriod = endOfToday;
  } else if (period === "last_month" || period === "lastMonth") {
    const lastMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    const lmYear = lastMonthDate.getUTCFullYear();
    const lmMonth = lastMonthDate.getUTCMonth() + 1;
    const daysInLastMonth = new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate();
    startOfPeriod = createISTDate(lmYear, lmMonth, 1, false);
    endOfPeriod = createISTDate(lmYear, lmMonth, daysInLastMonth, true);
  } else if (period === "custom") {
    if (dateFromParam) {
      const trimmedFrom = dateFromParam.trim();
      const match = trimmedFrom.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        startOfPeriod = createISTDate(Number(match[1]), Number(match[2]), Number(match[3]), false);
      } else {
        const d = parseScheduledDateTime(trimmedFrom);
        if (d) {
          startOfPeriod = d;
        }
      }
    }
    if (dateToParam) {
      const trimmedTo = dateToParam.trim();
      const match = trimmedTo.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match) {
        endOfPeriod = createISTDate(Number(match[1]), Number(match[2]), Number(match[3]), true);
      } else {
        const d = parseScheduledDateTime(trimmedTo);
        if (d) {
          endOfPeriod = d;
        }
      }
    } else if (dateFromParam) {
      endOfPeriod = new Date(startOfPeriod.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
  }

  return { startOfPeriod, endOfPeriod, istTodayStr };
}


