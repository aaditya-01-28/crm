import { NextResponse } from "next/server";
import { APP_VERSION, APP_BUILD, APP_RELEASE_DATE, APP_RELEASE_NOTES } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: APP_VERSION,
      buildNumber: APP_BUILD,
      downloadUrl: "https://crm.textorasms.com/downloads/textora-dialer.apk",
      releaseNotes: APP_RELEASE_NOTES,
      isMandatory: false,
      minSupportedBuild: 1,
      releasedAt: APP_RELEASE_DATE
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
