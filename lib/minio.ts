import * as Minio from "minio";

const globalForMinio = globalThis as unknown as {
  minioClient: Minio.Client | undefined;
};

export const minioClient =
  globalForMinio.minioClient ??
  new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000"),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "textora_minio",
    secretKey: process.env.MINIO_SECRET_KEY || "textora_minio_secret",
  });

if (process.env.NODE_ENV !== "production")
  globalForMinio.minioClient = minioClient;

export const BUCKET_NAME = process.env.MINIO_BUCKET || "payment-receipts";

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET_NAME);
  if (!exists) {
    await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
  }
}

export async function getPresignedUploadUrl(
  objectName: string,
  expiry = 600 // 10 minutes
): Promise<string> {
  await ensureBucket();
  return minioClient.presignedPutObject(BUCKET_NAME, objectName, expiry);
}

export function getPublicUrl(objectName: string): string {
  const endpoint = process.env.MINIO_ENDPOINT || "localhost";
  const port = process.env.MINIO_PORT || "9000";
  const ssl = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
  return `${ssl}://${endpoint}:${port}/${BUCKET_NAME}/${objectName}`;
}
