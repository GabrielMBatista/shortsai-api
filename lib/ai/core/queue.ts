export class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private running = 0;
    // Reduce concurrency to 1 to strictly adhere to Gemini Video (Veo) rate limits (e.g. 2 RPM)
    private maxConcurrent = 1;

    async add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const wrapper = async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (e) {
                    reject(e);
                } finally {
                    this.running--;
                    this.processNext();
                }
            };
            this.queue.push(wrapper);
            this.processNext();
        });
    }

    private processNext() {
        if (this.running < this.maxConcurrent && this.queue.length > 0) {
            this.running++;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}

export const generationQueue = new RequestQueue();

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    // Increase backoff significantly for quota errors (15s base). 
    // Gemini quotas are per minute, so 2s is useless.
    baseDelay = 15000
): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        const isQuotaError =
            error?.status === 429 ||
            error?.status === 503 ||
            (error?.message && error.message.includes("429")) ||
            (error?.message && error.message.includes("RESOURCE_EXHAUSTED")) ||
            (error?.message && error.message.includes("Model Refusal") && (error.message.includes("Okay") || error.message.includes("Here")));

        if (retries > 0 && isQuotaError) {
            console.warn(`Quota hit(429).Retrying in ${baseDelay}ms... (${retries} retries left)`);
            await wait(baseDelay);
            return retryWithBackoff(fn, retries - 1, baseDelay * 2);
        }
        throw error;
    }
}
