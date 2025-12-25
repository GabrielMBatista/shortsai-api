import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

export const dynamic = 'force-dynamic';

// Directory inside container (mapped to ./local_media_cache on host)
const CACHE_DIR = process.env.MEDIA_CACHE_DIR || '/app/data/media_cache';

// Ensure cache directory exists on startup
if (!fs.existsSync(CACHE_DIR)) {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`[Assets Proxy] Created cache directory: ${CACHE_DIR}`);
    } catch (e) {
        console.warn(`[Assets Proxy] Failed to create cache dir: ${e}`);
    }
}

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

        if (decodedUrl.startsWith('http')) {
            const urlObj = new URL(decodedUrl);
            objectKey = urlObj.pathname.substring(1);
        } else {
            objectKey = decodedUrl;
        }
        objectKey = objectKey.split('?')[0];

        // Fix: Strip bucket name from key if it exists (for MinIO/Path-style URLs)
        const bucketName = process.env.R2_BUCKET_NAME;
        if (bucketName && objectKey.startsWith(`${bucketName}/`)) {
            console.log(`[Assets Proxy] Stripping bucket name from key: ${objectKey}`);
            objectKey = objectKey.substring(bucketName.length + 1);
        }

        // 1. Check Local Cache (Filesystem)
        // Sanitize key to be a valid filename
        const safeKey = objectKey.replace(/[^a-zA-Z0-9.-]/g, '_');
        const localFilePath = path.join(CACHE_DIR, safeKey);

        let useLocalCache = false;
        let fileSize = 0;

        try {
            if (fs.existsSync(localFilePath)) {
                const stats = fs.statSync(localFilePath);
                if (stats.size > 0) {
                    useLocalCache = true;
                    fileSize = stats.size;
                }
            }
        } catch (e) {
            console.warn("[Assets Proxy] Cache check failed:", e);
        }

        if (useLocalCache) {
            // --- SERVE FROM DISK (Efficient Local Streaming) ---
            // console.log(`[Assets Proxy] HIT: ${safeKey}`);

            const range = req.headers.get('range');

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                const fileStream = fs.createReadStream(localFilePath, { start, end });

                // Convert Node stream to Web Stream
                // @ts-ignore
                const webStream = new ReadableStream({
                    start(controller) {
                        fileStream.on('data', (chunk) => controller.enqueue(chunk));
                        fileStream.on('end', () => controller.close());
                        fileStream.on('error', (err) => controller.error(err));
                    }
                });

                return new NextResponse(webStream, {
                    status: 206,
                    headers: {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize.toString(),
                        'Content-Type': 'video/mp4', // Assume mp4/video usually
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=31536000, immutable'
                    }
                });
            } else {
                const fileStream = fs.createReadStream(localFilePath);
                // @ts-ignore
                const webStream = new ReadableStream({
                    start(controller) {
                        fileStream.on('data', (chunk) => controller.enqueue(chunk));
                        fileStream.on('end', () => controller.close());
                        fileStream.on('error', (err) => controller.error(err));
                    }
                });

                return new NextResponse(webStream, {
                    status: 200,
                    headers: {
                        'Content-Length': fileSize.toString(),
                        'Content-Type': 'video/mp4',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'Accept-Ranges': 'bytes'
                    }
                });
            }
        }

        // 2. CACHE MISS -> Download from R2
        console.log(`[Assets Proxy] MISS. Downloading: ${objectKey}`);

        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: objectKey,
        });

        const s3Response = await s3Client.send(command);

        if (!s3Response.Body) {
            return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
        }

        // Save to disk (Atomic-ish)
        const nodeStream = s3Response.Body as NodeJS.ReadableStream;
        const tempPath = localFilePath + '.downloading';

        await streamPipeline(nodeStream, fs.createWriteStream(tempPath));

        // Rename to final only after full download
        fs.renameSync(tempPath, localFilePath);

        console.log(`[Assets Proxy] Downloaded & Cached: ${localFilePath}`);

        // Recursive redirect to self would be easiest, but let's serve the new file directly
        const stats = fs.statSync(localFilePath);
        fileSize = stats.size;
        const fileStream = fs.createReadStream(localFilePath);

        // @ts-ignore
        const webStream = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk) => controller.enqueue(chunk));
                fileStream.on('end', () => controller.close());
                fileStream.on('error', (err) => controller.error(err));
            }
        });

        return new NextResponse(webStream, {
            status: 200,
            headers: {
                'Content-Length': fileSize.toString(),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Accept-Ranges': 'bytes'
            }
        });

    } catch (error: any) {
        console.error('[Assets Proxy] Error:', error);
        if (error.name === 'NoSuchKey') {
            return NextResponse.json({ error: 'File not found in R2' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Internal Error', details: error.message }, { status: 500 });
    }
}
