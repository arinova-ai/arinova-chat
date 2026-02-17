import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../env.js";

const isR2Configured = !!(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

const s3 = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * Upload a file to R2. Returns the public URL.
 * If R2 is not configured, returns null (caller should fall back to local disk).
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string | null> {
  if (!s3) return null;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${env.R2_PUBLIC_URL}/${key}`;
}

export { isR2Configured };
