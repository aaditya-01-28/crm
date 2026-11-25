export const APP_VERSION = "1.3.2";
export const APP_BUILD = 16;
export const APP_RELEASE_DATE = "2026-11-25";
export const APP_RELEASE_NOTES = [
  "Fixed duplicate post-call disposition prompt & duplicate call log creation after Push-to-Dial calls",
  "Dynamic Daily Calling Progress synced with live total calls & Level 2/3 Daily Calling Target assignment",
  "Cleaned up Live SIM Telephony card and removed unused Telephony Status header dropdown",
  "Fixed Post-Call Save & Sync reliability, 20s request timeout, and visible inline error reporting",
  "Added explicit Interested disposition with 1-follow-up multi-select across Web CRM and Mobile Dialer",
  "Added Interested Leads filter tab in Leads Directory and Mobile Calling Queue",
  "Preserved historical Interested analytics while applying explicit Interested tracking for all new calls",
  "Auto-resolve pending Agenda callbacks & demos when disposed from Mobile Dialer (including RNR)",
  "New Agenda & Reminders tab in Mobile Dialer with overdue/today badge & notification bell",
  "Enhanced Agenda push notifications for overdue, 5-min warning, and exact scheduled time alerts",
  "Real-time Interested Leads tracking and conversion rate metrics on Dashboard and EOD Reports with quick-filter in Call Logs",
  "Automatic detection and duration capture for inbound customer callbacks after RNR",
  "Instant talk time crediting directly to sales rep daily performance dashboard & leaderboards",
  "Dedicated Inbound Customer Call disposition bottom sheet with lead identification and quick sync",
  "Visual Inbound Call (SIM) tag in Lead Activity Timeline on Web CRM and Mobile App",
  "Multi-select support for Interested Services and Customer Preferred Languages across Web CRM and Mobile APK",
  "Fixed lead profile update persistence in Mobile APK and backend API (resolved JSONB cast issue on custom_metadata)",
];
