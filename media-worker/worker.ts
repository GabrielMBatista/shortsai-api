import { Worker, Job } from 'bullmq';
import { connectionOptions } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { getGoogleAuth, downloadDriveFile, uploadYouTubeVideo, listDriveChanges } from '@/lib/services/google-drive';
import { videoTransferQueue, VIDEO_TRANSFER_QUEUE_NAME } from '@/lib/queues';
import { VideoTransferStatus } from '@prisma/client';

export const worker = new Worker(
    VIDEO_TRANSFER_QUEUE_NAME,
    async (job: Job) => {
        console.log(`Processing job ${job.id} (${job.name})`);

        try {
            if (job.name === 'sync-drive') {
                await handleSyncDrive(job);
            } else if (job.name === 'video-transfer' || !!job.data.videoTransferJobId) {
                await handleVideoTransfer(job);
            } else {
                console.warn(`Unknown job name: ${job.name}`);
            }
            return { status: 'completed' };
        } catch (err: any) {
            console.error(`Job ${job.id} failed:`, err);
            throw err;
        }
    },
    {
        connection: connectionOptions,
        concurrency: 2,
        limiter: {
            max: 50,
            duration: 1000
        }
    }
);

async function handleSyncDrive(job: Job) {
    const { userId, accountId } = job.data;

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('Account not found');

    const auth = await getGoogleAuth(userId);

    // 2. List Changes
    const result = await listDriveChanges(auth, account.drivePageToken);

    // Fallback se não houver mudanças ou a resposta for vazia
    const changes = result?.changes || [];
    const newStartPageToken = result?.newStartPageToken;

    console.log(`Found ${changes.length} changes for user ${userId}`);

    let addedCount = 0;
    for (const change of changes) {
        if (change.file && !change.removed && change.fileId) {
            if (change.file.mimeType && change.file.mimeType.startsWith('video/')) {
                const exists = await prisma.videoTransferJob.findFirst({
                    where: { driveFileId: change.fileId }
                });

                if (!exists) {
                    const fileSize = change.file.size ? BigInt(change.file.size) : BigInt(0);

                    const newJob = await prisma.videoTransferJob.create({
                        data: {
                            userId,
                            driveFileId: change.fileId!,
                            driveFileName: change.file.name || 'Untitled',
                            driveMimeType: change.file.mimeType,
                            driveFileSize: fileSize,
                            driveChecksum: change.file.md5Checksum,
                            status: VideoTransferStatus.QUEUED
                        }
                    });

                    await videoTransferQueue.add('video-transfer', {
                        videoTransferJobId: newJob.id
                    }, {
                        removeOnComplete: true
                    });
                    addedCount++;
                }
            }
        }
    }

    if (newStartPageToken) {
        await prisma.account.update({
            where: { id: accountId },
            data: { drivePageToken: newStartPageToken }
        });
    }

    console.log(`Sync completed. Added ${addedCount} transfer jobs.`);
}

async function handleVideoTransfer(job: Job) {
    const { videoTransferJobId } = job.data;

    const transferJob = await prisma.videoTransferJob.findUnique({
        where: { id: videoTransferJobId },
        include: { user: true },
    });

    if (!transferJob) {
        throw new Error(`VideoTransferJob ${videoTransferJobId} not found`);
    }

    await prisma.videoTransferJob.update({
        where: { id: videoTransferJobId },
        data: {
            status: VideoTransferStatus.PROCESSING,
            startedAt: new Date(),
            attempts: { increment: 1 },
        },
    });

    const auth = await getGoogleAuth(transferJob.userId);

    const driveStream = await downloadDriveFile(auth, transferJob.driveFileId);

    const fileSize = Number(transferJob.driveFileSize);
    const youtubeRes = await uploadYouTubeVideo(
        auth,
        {
            title: transferJob.driveFileName || 'Untitled Video',
            description: `Uploaded via ShortsAI from Drive File ${transferJob.driveFileName}`,
        },
        driveStream,
        fileSize
    );

    await prisma.videoTransferJob.update({
        where: { id: videoTransferJobId },
        data: {
            status: VideoTransferStatus.COMPLETED,
            completedAt: new Date(),
            youtubeVideoId: youtubeRes.id,
            youtubeStatus: youtubeRes.status?.uploadStatus || 'uploaded',
        },
    });
    console.log(`Video Transfer ${videoTransferJobId} completed. YT ID: ${youtubeRes.id}`);
}
