import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Ensure environment variables are loaded if running as a script
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

/**
 * Detecta se a string é Base64, faz upload e retorna a URL pública.
 * Se já for uma URL, retorna ela mesma.
 */
export async function uploadBase64ToR2(
  content: string | null,
  folder: UploadFolder
): Promise<string | null> {
  if (!content) return null;

  // Se já começar com http, não é base64, já é um link. Retorna.
  if (content.startsWith('http')) return content;

  // Regex para extrair mimeType e o buffer do base64
  // Formato esperado: "data:image/png;base64,iVBORw0KGgo..."
  const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

  if (!matches || matches.length !== 3) {
    if (content.length > 200) { // Só avisa se parecer conteúdo real
        console.warn(`⚠️ Conteúdo inválido ou não é base64 padrão (len=${content.length}). Ignorando.`);
    }
    return content; // Retorna original pra não quebrar
  }

  const mimeType = matches[1]; // ex: image/png
  const base64Data = matches[2]; // O hash gigante
  const buffer = Buffer.from(base64Data, 'base64');

  // Define a extensão do arquivo
  const extension = mimeType.split('/')[1] || 'bin';
  const fileName = `${folder}/${randomUUID()}.${extension}`;

  try {
    if (!process.env.R2_BUCKET_NAME) {
        throw new Error("R2_BUCKET_NAME not defined");
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
    console.error(`❌ Erro ao fazer upload para ${folder}:`, error);
    throw error;
  }
}
