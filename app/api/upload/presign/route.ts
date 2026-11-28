import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, getPublicUrl } from "@/lib/minio";
import { requireActiveSession } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

const FOLDER_EXTENSIONS: Record<string, Set<string>> = {
  receipts: new Set(["jpg", "jpeg", "png", "webp", "pdf"]),
  avatars: new Set(["jpg", "jpeg", "png", "webp"]),
  recordings: new Set(["m4a", "mp3", "wav", "aac", "ogg", "3gp", "webm"]),
};

const ALLOWED_SUBFOLDERS = new Set(Object.keys(FOLDER_EXTENSIONS));

export async function POST(request: NextRequest) {
  try {
    const session = await requireActiveSession(request);
    if (!session?.tenantId || !session?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { filename, contentType, folder } = body;

    const rawExt = typeof filename === "string" ? filename.split(".").pop()?.toLowerCase() || "jpg" : "jpg";
    const ext = rawExt.replace(/[^a-z0-9]/g, "");

    const sanitizedFolder =
      folder && ALLOWED_SUBFOLDERS.has(folder)
        ? folder
        : typeof contentType === "string" && contentType.startsWith("audio/")
        ? "recordings"
        : "receipts";

    if (!FOLDER_EXTENSIONS[sanitizedFolder].has(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not allowed in ${sanitizedFolder}.` },
        { status: 400 }
      );
    }

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
