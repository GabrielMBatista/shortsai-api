
import { Worker, Job } from 'bullmq';
import { connectionOptions } from '../redis';
import { SCHEDULE_GENERATION_QUEUE_NAME } from '../queues';
import { WeeklyScheduler } from '../ai/services/weekly-scheduler';

/**
 * Weekly Schedule Worker
 * Processes AI generation tasks in the background to avoid HTTP timeouts.
 */
console.log('[Worker] Initializing Schedule Worker...');

const worker = new Worker(
    SCHEDULE_GENERATION_QUEUE_NAME,
    async (job: Job) => {
        console.log(`[ScheduleWorker] Processing Job ${job.id}...`);
        const { userId, personaId, message, channelContext } = job.data;

        try {
            // Re-use the existing logic inside WeeklyScheduler
            // Note: WeeklyScheduler.generate() is currently returning a JSON string.
            // We await it here. Since this is a worker, it can take mins.
            const resultJson = await WeeklyScheduler.generate(userId, personaId, message, channelContext);

            console.log(`[ScheduleWorker] Job ${job.id} completed successfully.`);

            // Return result to be stored in Redis (removeOnComplete: false)
            return { result: resultJson };
        } catch (error: any) {
            console.error(`[ScheduleWorker] Job ${job.id} failed:`, error);
            throw error;
        }
    },
    {
        connection: connectionOptions,
        concurrency: 2 // Allow 2 concurrent generations system-wide
    }
);

worker.on('completed', (job) => {
    console.log(`[ScheduleWorker] Job ${job.id} finished.`);
});

worker.on('failed', (job, err) => {
    console.error(`[ScheduleWorker] Job ${job.id} failed with ${err.message}`);
});

export default worker;
