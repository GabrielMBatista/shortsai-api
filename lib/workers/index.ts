/**
 * Initialize BullMQ workers within the API process
 * This runs automatically when the API starts
 */

import { Worker } from 'bullmq';
import { connectionOptions } from './redis';
import {
    SOCIAL_POSTING_QUEUE_NAME,
    VIDEO_TRANSFER_QUEUE_NAME,
    SCHEDULE_GENERATION_QUEUE_NAME
} from './queues';
import { WeeklyScheduler } from './ai/services/weekly-scheduler';

// Only initialize workers in server environment (not during build)
if (typeof window === 'undefined' && process.env.NEXT_BUILD !== 'true') {
    console.log('[Workers] Initializing BullMQ workers in API process...');

    // ============================================
    // SCHEDULE GENERATION WORKER
    // ============================================
    const scheduleWorker = new Worker(
        SCHEDULE_GENERATION_QUEUE_NAME,
        async (job) => {
            console.log(`[ScheduleWorker] Processing Job ${job.id}`);
            const { userId, personaId, message, channelContext } = job.data;

            try {
                await job.updateProgress(10);
                const resultJson = await WeeklyScheduler.generate(userId, personaId, message, channelContext);

                await job.updateProgress(100);
                console.log(`[ScheduleWorker] Job ${job.id} completed (${resultJson.length} chars)`);

                return { result: resultJson };
            } catch (error: any) {
                console.error(`[ScheduleWorker] Job ${job.id} failed:`, error);
                throw error;
            }
        },
        { connection: connectionOptions, concurrency: 2 }
    );

    scheduleWorker.on('ready', () => console.log('[ScheduleWorker] ✅ Ready'));
    scheduleWorker.on('completed', (job) => console.log(`[ScheduleWorker] ✅ Job ${job.id} completed`));
    scheduleWorker.on('failed', (job, err) => console.error(`[ScheduleWorker] ❌ Job ${job?.id} failed:`, err.message));

    // ============================================
    // SOCIAL POSTING WORKER
    // ============================================
    const socialWorker = new Worker(
        SOCIAL_POSTING_QUEUE_NAME,
        async (job) => {
            // TODO: Implement social posting logic when needed
            console.log(`[SocialWorker] Processing ${job.id}`);
            return { success: true };
        },
        { connection: connectionOptions, concurrency: 5 }
    );

    socialWorker.on('ready', () => console.log('[SocialWorker] ✅ Ready'));

    // ============================================
    // VIDEO TRANSFER WORKER
    // ============================================
    const transferWorker = new Worker(
        VIDEO_TRANSFER_QUEUE_NAME,
        async (job) => {
            // TODO: Implement transfer logic when needed
            console.log(`[TransferWorker] Processing ${job.id}`);
            return { success: true };
        },
        { connection: connectionOptions, concurrency: 3 }
    );

    transferWorker.on('ready', () => console.log('[TransferWorker] ✅ Ready'));

    console.log('[Workers] ✅ All BullMQ workers initialized');

    // Graceful shutdown
    const shutdown = async () => {
        console.log('[Workers] Shutting down...');
        await Promise.all([
            scheduleWorker.close(),
            socialWorker.close(),
            transferWorker.close()
        ]);
        console.log('[Workers] ✅ Closed');
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
