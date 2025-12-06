import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = 'force-dynamic';

const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

export async function GET(req: NextRequest) {
    const urlParam = req.nextUrl.searchParams.get('url');

    if (!urlParam) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        let objectKey = '';
        const decodedUrl = decodeURIComponent(urlParam);

        // Logic to extract key from R2 URL
        if (decodedUrl.startsWith('http')) {
            const urlObj = new URL(decodedUrl);
            // Remove leading slash
            objectKey = urlObj.pathname.substring(1);
        } else {
            // Assume it is already a key
            objectKey = decodedUrl;
        }

        console.log(`[Assets Proxy] Fetching from S3/R2: ${objectKey}`);

        if (!process.env.R2_BUCKET_NAME) {
            throw new Error("R2_BUCKET_NAME not visible to API");
        }

        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: objectKey,
        });

        const s3Response = await s3Client.send(command);

        if (!s3Response.Body) {
            return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
        }

        // Convert strict S3 stream to Web Stream Response
        // @ts-ignore
        const stream = s3Response.Body.transformToWebStream ? s3Response.Body.transformToWebStream() : s3Response.Body;

        return new NextResponse(stream, {
            headers: {
                'Content-Type': s3Response.ContentType || 'application/octet-stream',
                'Content-Length': s3Response.ContentLength?.toString() || '',
                'Access-Control-Allow-Origin': '*', // CRITICAL for Canvas
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });

    } catch (error: any) {
        console.error('[Assets Proxy] S3 Error:', error);
        // Handle NoSuchKey explicitly
        if (error.name === 'NoSuchKey') {
            return NextResponse.json({ error: 'File not found in R2' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Internal Storage Error', details: error.message }, { status: 500 });
    }
}
