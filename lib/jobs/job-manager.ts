// Simple in-memory job store (could be replaced with Redis/DB in future)
interface Job {
    id: string;
    userId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    result?: any;
    error?: string;
    createdAt: number;
}

const jobs = new Map<string, Job>();

// Cleanup old jobs after 1 hour
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [id, job] of jobs.entries()) {
        if (now - job.createdAt > oneHour) {
            jobs.delete(id);
        }
    }
}, 5 * 60 * 1000); // Run every 5 minutes

export class JobManager {
    static createJob(userId: string): string {
        const id = crypto.randomUUID();
        jobs.set(id, {
            id,
            userId,
            status: 'pending',
            progress: 0,
            createdAt: Date.now()
        });
        return id;
    }

    static getJob(id: string): Job | undefined {
        return jobs.get(id);
    }

    static updateProgress(id: string, progress: number) {
        const job = jobs.get(id);
        if (job) {
            job.progress = progress;
            job.status = 'processing';
        }
    }

    static completeJob(id: string, result: any) {
        const job = jobs.get(id);
        if (job) {
            job.status = 'completed';
            job.progress = 100;
            job.result = result;
        }
    }

    static failJob(id: string, error: string) {
        const job = jobs.get(id);
        if (job) {
            job.status = 'failed';
            job.error = error;
        }
    }
}
