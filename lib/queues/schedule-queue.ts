import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Redis connection
const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
});

// Queue for schedule generation
export const scheduleQueue = new Queue('schedule-generation', { connection });

// Job data interface
export interface ScheduleJobData {
    userId: string;
    personaId: string;
    message: string;
    channelContext: string;
    language?: string;
    voice?: string;
}

// Initialize worker (processes jobs in background)
const worker = new Worker(
    'schedule-generation',
    async (job: Job<ScheduleJobData>) => {
        const { userId, personaId, message, channelContext, language, voice } = job.data;

        console.log(`[ScheduleWorker] Processing job ${job.id}...`);

        // Dynamic import to avoid circular dependencies
        const { WeeklyScheduler } = await import('../ai/services/weekly-scheduler');

        // Build config context
        let configContext = '';
        if (language || voice) {
            configContext = `\n\n═══════════════════════════════════════
CONFIGURAÇÕES DO USUÁRIO:
${language ? `- IDIOMA OBRIGATÓRIO: ${language}\n  Todas as narrações DEVEM ser escritas em ${language}.` : ''}
${voice ? `- VOZ TTS: ${voice}\n  Use esta voz para referência de tom e estilo.` : ''}
═══════════════════════════════════════\n`;
        }

        const result = await WeeklyScheduler.generate(
            userId,
            personaId,
            message + configContext,
            channelContext
        );

        console.log(`[ScheduleWorker] ✅ Job ${job.id} completed (${result.length} chars)`);

        return result;
    },
    {
        connection,
        concurrency: 2 // Process 2 jobs at a time
    }
);

worker.on('completed', (job) => {
    console.log(`[ScheduleWorker] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
    console.error(`[ScheduleWorker] Job ${job?.id} failed:`, err);
});

console.log('[ScheduleWorker] Worker started and listening for jobs...');
