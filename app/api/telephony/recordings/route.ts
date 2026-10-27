import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { minioClient, BUCKET_NAME, ensureBucket, getPublicUrl } from "@/lib/minio";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const repId = request.headers.get("x-user-id") || session?.sub || "";

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const callLogId = formData.get("callLogId") as string | null;
    const leadId = formData.get("leadId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name || "recording.m4a";
    const ext = originalName.split(".").pop() || "m4a";
    const fileName = `${uuidv4()}.${ext}`;
    const objectName = `recordings/${fileName}`;

    let recordingUrl = "";

    // 1. Try MinIO Object Storage first
    try {
      await ensureBucket();
      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        buffer,
        buffer.length,
        { "Content-Type": file.type || "audio/mp4" }
      );
      recordingUrl = getPublicUrl(objectName);
    } catch (minioErr) {
      // 2. Fallback to local static public storage if MinIO is not running
      console.warn("[RECORDING_UPLOAD] MinIO unavailable, falling back to local storage:", minioErr);
      const publicDir = path.join(process.cwd(), "public", "recordings");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const localFilePath = path.join(publicDir, fileName);
      fs.writeFileSync(localFilePath, buffer);
      recordingUrl = `/recordings/${fileName}`;
    }

    // 3. If callLogId is provided, attach directly to call_logs
    if (callLogId) {
      await withClient(async (client) => {
        await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});
        await client.query(
          "UPDATE call_logs SET recording_url = $1 WHERE id = $2 AND tenant_id = $3",
          [recordingUrl, callLogId, tenantId]
        );
      });
    }

    return NextResponse.json({
      success: true,
      recordingUrl,
      objectName,
      leadId,
      callLogId,
    });
  } catch (error) {
    console.error("[RECORDING_UPLOAD_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to upload audio recording" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  const tenantId = request.headers.get("x-tenant-id") || session?.tenantId || "";
  const { searchParams } = new URL(request.url);

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callLogId = searchParams.get("callLogId");
  const leadId = searchParams.get("leadId");

  try {
    return await withClient(async (client) => {
      await client.query("ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS recording_url TEXT;").catch(() => {});

      if (callLogId) {
        const res = await client.query(
          `SELECT id, recording_url as "recordingUrl", duration_seconds as "durationSeconds",
                  call_timestamp as "callTimestamp", disposition
           FROM call_logs
           WHERE id = $1 AND tenant_id = $2
           LIMIT 1`,
          [callLogId, tenantId]
        );
        return NextResponse.json({ recording: res.rows[0] || null });
      }

      if (leadId) {
        const res = await client.query(
          `SELECT id, recording_url as "recordingUrl", duration_seconds as "durationSeconds",
                  call_timestamp as "callTimestamp", disposition
           FROM call_logs
           WHERE lead_id = $1 AND tenant_id = $2 AND recording_url IS NOT NULL
           ORDER BY call_timestamp DESC`,
          [leadId, tenantId]
        );
        return NextResponse.json({ recordings: res.rows });
      }

      const res = await client.query(
        `SELECT id, lead_id as "leadId", recording_url as "recordingUrl", 
                duration_seconds as "durationSeconds", call_timestamp as "callTimestamp", disposition
         FROM call_logs
         WHERE tenant_id = $1 AND recording_url IS NOT NULL
         ORDER BY call_timestamp DESC
         LIMIT 20`,
        [tenantId]
      );
      return NextResponse.json({ recordings: res.rows });
    });
  } catch (error) {
    console.error("[RECORDINGS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
