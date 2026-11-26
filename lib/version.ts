export const APP_VERSION = "1.3.7";
export const APP_BUILD = 21;
export const APK_VERSION = "1.3.7";
export const APK_BUILD = 21;
export const APP_RELEASE_DATE = "2026-11-26";
export const APP_RELEASE_NOTES = [
  "Fixed scheduled demo RNR/reschedule mistakenly counting as Demo Completed in Reports",
  "Improved real-time Inbound & Missed-Inbound queue with 60s lead cache and VoWiFi call detection",
  "30-day persistent Mobile APK session & Vivo Android 14 KeyStore fallback fix",
  "Real-time Inbound Call & Missed-Inbound Queue with automatic talk-time protection",
  "Added Secondary / Alternate Call & WhatsApp number support across Web CRM and Mobile Dialer",
  "Preserved Google Sheet Close Dates and enabled repeat Top-Up / Recharge deal imports",
  "Switched all date & time selectors to 12-hour AM/PM format across Web CRM and Mobile Dialer",
  "Fixed standalone scheduled task deletion in Lead Dossier, Pipeline Custom Range filter, and Demo Scheduled pipeline sync",
  "Added Level 3 Super Admin permission to delete mistaken activity/call logs from Lead Dossier (automatically cleans up reports & pipeline)",
  "Scheduled Callback & Demo calls now show the exact Update Outcome options (Completed, RNR, Reschedule, Not Interested) in Mobile Dialer",
  "Added post-call disposition sheet directly when calling from the Mobile Agenda tab",
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
