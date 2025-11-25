import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Initialize S3 Client
// Ensure these env vars are set: S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME, S3_REGION
const s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
    },
    forcePathStyle: true, // Needed for MinIO
});

export async function uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    contentType: string
): Promise<string> {
    const bucketName = process.env.S3_BUCKET_NAME;

    if (!bucketName) {
        throw new Error('S3_BUCKET_NAME is not defined');
    }

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read', // Adjust based on your privacy needs
    });

    try {
        await s3Client.send(command);
        // Construct URL based on endpoint or standard S3 URL
        // For MinIO/S3 compatible:
        if (process.env.S3_PUBLIC_URL) {
            return `${process.env.S3_PUBLIC_URL}/${fileName}`;
        }
        return `${process.env.S3_ENDPOINT}/${bucketName}/${fileName}`;
    } catch (error) {
        console.error('Error uploading file to S3:', error);
        throw error;
    }
}

export async function uploadBase64(
    base64Data: string,
    fileName: string
): Promise<string> {
    // Remove header if present (e.g., "data:image/png;base64,")
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    // Detect mime type or default to png/mp3 based on usage
    const contentType = fileName.endsWith('.mp3') ? 'audio/mpeg' : 'image/png';

    return uploadFile(buffer, fileName, contentType);
}
