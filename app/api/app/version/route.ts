import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: "1.1.0",
      buildNumber: 2,
      downloadUrl: "https://crm.textorasms.com/downloads/textora-dialer.apk",
      releaseNotes: [
        "Added 'Last Month' and 'Custom Date Range' filters to the performance dashboard",
        "Role-level stats: Sales Rep vs Organization analytics",
        "Theme enhancements: Complete Light & Dark mode support across Lead Dossier and dialogs",
        "In-app auto-update engine: Instant updates without manual APK installs in the future",
        "Performance and stability improvements"
      ],
      isMandatory: false,
      minSupportedBuild: 1,
      releasedAt: "2026-11-23"
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
}
