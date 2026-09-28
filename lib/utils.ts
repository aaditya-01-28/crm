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

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
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
