import { NextResponse } from "next/server";
import { APK_VERSION, APK_BUILD, APP_RELEASE_DATE, APP_RELEASE_NOTES } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: APK_VERSION,
      buildNumber: APK_BUILD,
      downloadUrl: "https://crm.textorasms.com/downloads/textora-dialer.apk",
      releaseNotes: APP_RELEASE_NOTES,
      isMandatory: false,
      minSupportedBuild: 1,
      sha256: process.env.APK_SHA256?.trim() || null,
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
