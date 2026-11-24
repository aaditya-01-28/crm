import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: "1.2.1",
      buildNumber: 4,
      downloadUrl: "https://crm.textorasms.com/downloads/textora-dialer.apk",
      releaseNotes: [
        "Eliminated duplicate call log issue on CRM call sync",
        "Seamless synchronization between SIM dialer and PostCall disposition",
        "Mandatory non-dismissible post-call disposition dialog",
        "Added Callback & Demo Scheduled date/time/details pickers",
        "Dynamic personalized WhatsApp intro pitch matching rep profile"
      ],
      isMandatory: false,
      minSupportedBuild: 1,
      releasedAt: "2026-11-24"
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
