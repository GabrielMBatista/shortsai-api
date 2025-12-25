
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error("Missing R2 credentials in .env");
    process.exit(1);
}

const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});

const corsRules = [
    {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "HEAD", "DELETE"],
        AllowedOrigins: [
            "http://localhost:3000",
            "http://localhost:3333",
            "http://localhost",
            "https://srv1161960.hstgr.cloud",
            "*" // Allow everything for dev purposes to ensure it works
        ],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000
    }
];

async function updateCors() {
    console.log(`Setting CORS for bucket: ${bucketName}...`);
    try {
        const command = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: corsRules
            }
        });

        await client.send(command);
        console.log("✅ CORS configuration updated successfully!");
        console.log("Allowed Origins:", corsRules[0].AllowedOrigins);
    } catch (err) {
        console.error("❌ Failed to update CORS:", err);
    }
}

updateCors();
