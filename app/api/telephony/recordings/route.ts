import { NextRequest, NextResponse } from "next/server";
import { withClient } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth";
import { isSalesRep } from "@/lib/rbac";
import { isValidUuid } from "@/lib/security";
import { minioClient, BUCKET_NAME, ensureBucket, getPublicUrl } from "@/lib/minio";
import { v4 as uuidv4 } from "uuid";

const MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const callLogId = formData.get("callLogId") as string | null;
    const leadId = formData.get("leadId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Audio file must be non-empty and under 15 MB." },
        { status: 413 }
      );
    }

    if (callLogId && !isValidUuid(callLogId)) {
      return NextResponse.json({ error: "Invalid callLogId" }, { status: 400 });
    }
    if (leadId && !isValidUuid(leadId)) {
      return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
    }

    const rawExt = (file.name || "recording.m4a").split(".").pop()?.toLowerCase() || "m4a";
    const ext = rawExt.replace(/[^a-z0-9]/g, "");
    const allowedAudio = ["m4a", "mp3", "wav", "aac", "ogg", "3gp", "webm"];
    if (!allowedAudio.includes(ext)) {
      return NextResponse.json({ error: "Only audio recording files are allowed." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json({ error: "Audio payload exceeds 15 MB limit." }, { status: 413 });
    }

    if (callLogId) {
      const ownsCall = await withClient(async (client) => {
        const check = await client.query(
          `SELECT id FROM call_logs WHERE id = $1 AND tenant_id = $2 ${isSalesRep(role) ? "AND rep_id = $3" : ""} LIMIT 1`,
          isSalesRep(role) ? [callLogId, tenantId, repId] : [callLogId, tenantId]
        );
        return check.rows.length > 0;
      });
      if (!ownsCall) {
        return NextResponse.json({ error: "Call log not found or forbidden" }, { status: 403 });
      }
    }

    const fileName = `${uuidv4()}.${ext}`;
    const objectName = `${tenantId}/recordings/${fileName}`;

    let recordingUrl = "";
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
      console.error("[RECORDING_UPLOAD] Object storage error:", minioErr);
      return NextResponse.json(
        { error: "Audio storage service unavailable. Please retry shortly." },
        { status: 503 }
      );
    }

    if (callLogId) {
      await withClient(async (client) => {
        await client.query(
          `UPDATE call_logs SET recording_url = $1 WHERE id = $2 AND tenant_id = $3 ${isSalesRep(role) ? "AND rep_id = $4" : ""}`,
          isSalesRep(role) ? [recordingUrl, callLogId, tenantId, repId] : [recordingUrl, callLogId, tenantId]
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
  const session = await requireActiveSession(request);
  if (!session?.tenantId || !session?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenantId = session.tenantId;
  const repId = session.sub;
  const role = session.role;
  const isRep = isSalesRep(role);
  const { searchParams } = new URL(request.url);

  const callLogId = searchParams.get("callLogId");
  const leadId = searchParams.get("leadId");

  if (callLogId && !isValidUuid(callLogId)) {
    return NextResponse.json({ error: "Invalid callLogId" }, { status: 400 });
  }
  if (leadId && !isValidUuid(leadId)) {
    return NextResponse.json({ error: "Invalid leadId" }, { status: 400 });
  }

  try {
    return await withClient(async (client) => {
      if (callLogId) {
        const res = await client.query(
          `SELECT id, recording_url as "recordingUrl", duration_seconds as "durationSeconds",
                  call_timestamp as "callTimestamp", disposition
           FROM call_logs
           WHERE id = $1 AND tenant_id = $2 ${isRep ? "AND rep_id = $3" : ""}
           LIMIT 1`,
          isRep ? [callLogId, tenantId, repId] : [callLogId, tenantId]
        );
        return NextResponse.json({ recording: res.rows[0] || null });
      }

      if (leadId) {
        const res = await client.query(
          `SELECT id, recording_url as "recordingUrl", duration_seconds as "durationSeconds",
                  call_timestamp as "callTimestamp", disposition
           FROM call_logs
           WHERE lead_id = $1 AND tenant_id = $2 AND recording_url IS NOT NULL ${isRep ? "AND rep_id = $3" : ""}
           ORDER BY call_timestamp DESC`,
          isRep ? [leadId, tenantId, repId] : [leadId, tenantId]
        );
        return NextResponse.json({ recordings: res.rows });
      }

      const res = await client.query(
        `SELECT id, lead_id as "leadId", recording_url as "recordingUrl", 
                duration_seconds as "durationSeconds", call_timestamp as "callTimestamp", disposition
         FROM call_logs
         WHERE tenant_id = $1 AND recording_url IS NOT NULL ${isRep ? "AND rep_id = $2" : ""}
         ORDER BY call_timestamp DESC
         LIMIT 20`,
        isRep ? [tenantId, repId] : [tenantId]
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
