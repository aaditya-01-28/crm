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

export function normalizePhone(raw: string): string {
  // Strip all non-digits
  const digits = raw.replace(/\D/g, "");
  // Handle +91 prefix → take last 10 digits
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function buildWALink(phone: string, text: string): string {
  const normalized = normalizePhone(phone);
  return `https://wa.me/91${normalized}?text=${encodeURIComponent(text)}`;
}

export function buildTelLink(phone: string): string {
  const normalized = normalizePhone(phone);
  return `tel:+91${normalized}`;
}

/** Textora standard WhatsApp greeting pitch */
export const WA_PITCH = `Hello Sir 👋
This is Aaditya from Textora Technologies Pvt Ltd.

Looking to grow your business faster and reach more customers instantly? 🚀
We offer smart messaging solutions to boost sales, engagement, and brand visibility 📈

✨ Our Services:
📲 Business WhatsApp API – Official & automated messaging
💬 Virtual WhatsApp – Bulk & personalised campaigns
📩 RCS Messaging – Rich, interactive messages
🔐 Transactional SMS – OTPs, alerts & notifications
📢 Promotional SMS – Offers, campaigns & branding
📞 Voice SMS – Automated voice calls at scale

📢 Reach customers instantly | Improve response rate | Increase conversions

📞 For details & free demo:
Aaditya
📧 aaditya@textorasms.com

📱 9902101007

Reply YES to get started 👍`;

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
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
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

export function getLanguageMeta(code?: string | null) {
  if (!code) return null;
  const match = LEAD_LANGUAGES.find(
    (l) => l.code.toLowerCase() === code.toLowerCase()
  );
  if (match) return match;
  return { code, label: code.toUpperCase(), flag: "🌐" };
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

