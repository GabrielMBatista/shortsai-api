/**
 * Unified BullMQ Worker
 * Processes all background job queues in one container
 */

import { Worker } from 'bullmq';
import { connectionOptions } from '../redis';
import {
    SOCIAL_POSTING_QUEUE_NAME,
    VIDEO_TRANSFER_QUEUE_NAME,
    SCHEDULE_GENERATION_QUEUE_NAME
} from '../queues';

// Import processors
import { WeeklyScheduler } from '../ai/services/weekly-scheduler';

console.log('[UnifiedWorker] ========================================');
console.log('[UnifiedWorker] Initializing BullMQ Workers...');
console.log('[UnifiedWorker] Redis Config:', connectionOptions);
console.log('[UnifiedWorker] ========================================\n');

// ============================================
// SCHEDULE GENERATION WORKER
// ============================================
const scheduleWorker = new Worker(
    SCHEDULE_GENERATION_QUEUE_NAME,
    async (job) => {
        console.log(`\n[ScheduleWorker] 🚀 Processing Job ${job.id}`);
        const { userId, personaId, message, channelContext } = job.data;

        try {
            await job.updateProgress(10);
            const resultJson = await WeeklyScheduler.generate(userId, personaId, message, channelContext);

            await job.updateProgress(100);
            console.log(`[ScheduleWorker] ✅ Job ${job.id} completed (${resultJson.length} chars)`);

            return { result: resultJson };
        } catch (error: any) {
            console.error(`[ScheduleWorker] ❌ Job ${job.id} failed:`, error);
            throw error;
        }
    },
    { connection: connectionOptions, concurrency: 2 }
);

scheduleWorker.on('ready', () => console.log('[ScheduleWorker] ✅ Ready'));
scheduleWorker.on('completed', (job) => console.log(`[ScheduleWorker] ✅ Job ${job.id} completed`));
scheduleWorker.on('failed', (job, err) => console.error(`[ScheduleWorker] ❌ Job ${job?.id} failed:`, err.message));

// ============================================
// SOCIAL POSTING WORKER (Placeholder)
// ============================================
const socialWorker = new Worker(
    SOCIAL_POSTING_QUEUE_NAME,
    async (job) => {
        console.log(`[SocialWorker] 📱 Processing social post ${job.id}`);
        // TODO: Implement social posting logic
        return { success: true };
    },
    { connection: connectionOptions, concurrency: 5 }
);

socialWorker.on('ready', () => console.log('[SocialWorker] ✅ Ready'));

// ============================================
// VIDEO TRANSFER WORKER (Placeholder)
// ============================================
const transferWorker = new Worker(
    VIDEO_TRANSFER_QUEUE_NAME,
    async (job) => {
        console.log(`[TransferWorker] 📤 Processing transfer ${job.id}`);
        // TODO: Implement Drive → YouTube transfer
        return { success: true };
    },
    { connection: connectionOptions, concurrency: 3 }
);

transferWorker.on('ready', () => console.log('[TransferWorker] ✅ Ready'));

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const shutdown = async () => {
    console.log('\n[UnifiedWorker] Shutting down gracefully...');
    await Promise.all([
        scheduleWorker.close(),
        socialWorker.close(),
        transferWorker.close()
    ]);
    console.log('[UnifiedWorker] ✅ All workers closed');
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[UnifiedWorker] ✅ All workers initialized and listening...\n');

export default { scheduleWorker, socialWorker, transferWorker };
