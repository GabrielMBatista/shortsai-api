import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import dotenv from 'dotenv';
dotenv.config();

const R2_ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

type UploadFolder = 'scenes/images' | 'scenes/videos' | 'scenes/audio' | 'characters' | 'music';

export async function uploadBufferToR2(
  buffer: Buffer,
  mimeType: string,
  folder: UploadFolder
): Promise<string> {
  // Define extension map for "natural" formats
  const extMap: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'video/mp4': 'mp4'
  };

  const extension = extMap[mimeType] || mimeType.split('/')[1] || 'bin';
  const fileName = `${folder}/${randomUUID()}.${extension}`;

  try {
    if (!process.env.R2_BUCKET_NAME) {
      throw new Error("R2_BUCKET_NAME not defined");
    }
    if (!process.env.NEXT_PUBLIC_STORAGE_URL) {
      console.warn("⚠️ NEXT_PUBLIC_STORAGE_URL environment variable is missing!");
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    }));

    const publicUrl = `${process.env.NEXT_PUBLIC_STORAGE_URL}/${fileName}`;
    return publicUrl;
  } catch (error) {
    console.error(`❌ Erro ao fazer upload buffer para ${folder}:`, error);
    throw error;
  }
}

/**
 * Detecta se a string é Base64, faz upload e retorna a URL pública.
 * Se já for uma URL, retorna ela mesma.
 */
export async function uploadBase64ToR2(
  content: string | null,
  folder: UploadFolder
): Promise<string | null> {
  if (!content) return null;
  if (content.startsWith('http')) return content;

  const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

  if (!matches || matches.length !== 3) {
    if (content.length > 200) {
      console.warn(`⚠️ Conteúdo inválido ou não é base64 padrão (len=${content.length}). Ignorando.`);
    }
    return content;
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  return uploadBufferToR2(buffer, mimeType, folder);
}

/**
 * Deletes a file from R2 given its public URL
 */
export async function deleteFromR2(url: string | null): Promise<void> {
  if (!url || !url.includes(process.env.NEXT_PUBLIC_STORAGE_URL || '')) {
    return; // Not an R2 URL or null, skip
  }

  try {
    // Extract the key from the URL
    // URL format: https://pub-xxxxx.r2.dev/folder/file.ext
    const storageUrl = process.env.NEXT_PUBLIC_STORAGE_URL!;
    const key = url.replace(`${storageUrl}/`, '');

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }));

    console.log(`✅ Deleted from R2: ${key}`);
  } catch (error) {
    console.error(`❌ Error deleting from R2:`, error);
    // Don't throw - we don't want deletion to fail if R2 delete fails
  }
}

