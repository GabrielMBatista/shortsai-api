
import { Worker, Job } from 'bullmq';
import { connectionOptions } from '../redis';
import { SCHEDULE_GENERATION_QUEUE_NAME } from '../queues';
import { WeeklyScheduler } from '../ai/services/weekly-scheduler';

// Skip worker initialization during Next.js build phase
const shouldSkipWorker = process.env.SKIP_REDIS_CONNECTION === 'true' || process.env.NEXT_BUILD === 'true';

let worker: Worker | null = null;

if (!shouldSkipWorker) {
    /**
     * Weekly Schedule Worker
     * Processes AI generation tasks in the background to avoid HTTP timeouts.
     */
    console.log('[ScheduleWorker] ========================================');
    console.log('[ScheduleWorker] Initializing Schedule Worker...');
    console.log('[ScheduleWorker] Queue:', SCHEDULE_GENERATION_QUEUE_NAME);
    console.log('[ScheduleWorker] Redis:', connectionOptions);
    console.log('[ScheduleWorker] ========================================');

    worker = new Worker(
        SCHEDULE_GENERATION_QUEUE_NAME,
        async (job: Job) => {
            console.log(`\n[ScheduleWorker] ========================================`);
            console.log(`[ScheduleWorker] 🚀 Processing Job ${job.id}`);
            console.log(`[ScheduleWorker] Data:`, JSON.stringify(job.data, null, 2));
            console.log(`[ScheduleWorker] ========================================\n`);

            const { userId, personaId, message, channelContext } = job.data;

            try {
                // Update progress
                await job.updateProgress(10);
                console.log(`[ScheduleWorker] Starting generation for user ${userId}...`);

                const resultJson = await WeeklyScheduler.generate(userId, personaId, message, channelContext);

                await job.updateProgress(100);
                console.log(`[ScheduleWorker] ✅ Job ${job.id} completed successfully.`);
                console.log(`[ScheduleWorker] Result length: ${resultJson.length} chars`);

                // Return result to be stored in Redis
                return { result: resultJson };
            } catch (error: any) {
                console.error(`[ScheduleWorker] ❌ Job ${job.id} failed:`, error);
                console.error(`[ScheduleWorker] Error stack:`, error.stack);
                throw error;
            }
        },
        {
            connection: connectionOptions,
            concurrency: 2 // Allow 2 concurrent generations system-wide
        }
    );

    worker.on('ready', () => {
        console.log('[ScheduleWorker] ✅ Worker is ready and waiting for jobs...');
    });

    worker.on('active', (job) => {
        console.log(`[ScheduleWorker] 🔄 Job ${job.id} is now active`);
    });

    worker.on('completed', (job) => {
        console.log(`[ScheduleWorker] ✅ Job ${job.id} completed and saved to Redis`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[ScheduleWorker] ❌ Job ${job?.id} failed:`, err.message);
        console.error(`[ScheduleWorker] Error details:`, err);
    });

    worker.on('error', (err) => {
        console.error('[ScheduleWorker] ⚠️ Worker error:', err);
    });

    console.log('[ScheduleWorker] Worker started and listening for jobs...');
} else {
    console.log('[ScheduleWorker] Skipped during build phase');
}

export default worker;
