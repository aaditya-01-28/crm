import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: "1.2.0",
      buildNumber: 3,
      downloadUrl: "https://crm.textorasms.com/downloads/textora-dialer.apk",
      releaseNotes: [
        "Mandatory non-dismissible post-call disposition dialog",
        "Added Callback & Demo Scheduled date/time/details pickers",
        "Dynamic personalized WhatsApp intro pitch matching rep profile",
        "Already Using toggle: Our Service vs Other Company Service",
        "Reliability enhancements for background call tracking"
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
