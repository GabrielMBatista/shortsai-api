import { generationQueue, retryWithBackoff } from './queue';
import { RateLimiter } from './rate-limiter';

export async function executeRequest<T>(isSystem: boolean, task: () => Promise<T>, userId?: string): Promise<T> {
    if (isSystem) {
        if (userId) await RateLimiter.checkRateLimits(userId);
        return generationQueue.add(() => retryWithBackoff(task));
    } else {
        return retryWithBackoff(task);
    }
}
