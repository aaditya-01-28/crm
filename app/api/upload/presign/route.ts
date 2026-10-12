import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, getPublicUrl } from "@/lib/minio";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, contentType } = body;

    const ext = filename?.split(".").pop() || "jpg";
    const objectName = `receipts/${uuidv4()}.${ext}`;

    const presignedUrl = await getPresignedUploadUrl(objectName);
    const publicUrl = getPublicUrl(objectName);

    return NextResponse.json({ presignedUrl, publicUrl, objectName });
  } catch (error) {
    console.error("[PRESIGN]", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
