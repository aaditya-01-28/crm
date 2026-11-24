import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, getPublicUrl } from "@/lib/minio";
import { getSession } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "pdf",
  "m4a", "mp3", "wav", "aac", "ogg", "3gp", "webm"
]);

const ALLOWED_SUBFOLDERS = new Set(["recordings", "receipts", "avatars"]);

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session?.tenantId || !session?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, folder } = body;

    const rawExt = filename?.split(".").pop()?.toLowerCase() || "jpg";
    const ext = rawExt.replace(/[^a-z0-9]/g, "");

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not allowed.` },
        { status: 400 }
      );
    }

    const sanitizedFolder =
      folder && ALLOWED_SUBFOLDERS.has(folder)
        ? folder
        : contentType?.startsWith("audio/")
        ? "recordings"
        : "receipts";

    const objectName = `${session.tenantId}/${sanitizedFolder}/${uuidv4()}.${ext}`;

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
