import { Redis } from 'ioredis';

const getRedisUrl = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL;
    }
    return 'redis://localhost:6379';
};

// Singleton Redis connection for BullMQ
// We need separate connections for Publisher and Subscriber in BullMQ usually,
// but BullMQ manages its own connections if we pass connection options.
// This is for general Redis usage if needed.

export const redis = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null, // Required by BullMQ
});

export const connectionOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
};

/**
 * Cache Wrapper for Database Queries
 * @param key Redis key
 * @param fetcher Async function to fetch data if cache miss
 * @param ttlSeconds TTL in seconds (default 5 mins)
 */
export async function cachedQuery<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number = 300
): Promise<T> {
    try {
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn('Redis Cache Error (Get):', e);
        // Fallback to fetcher on redis error
    }

    const data = await fetcher();

    if (data !== undefined && data !== null) {
        try {
            await redis.setex(key, ttlSeconds, JSON.stringify(data));
        } catch (e) {
            console.warn('Redis Cache Error (Set):', e);
        }
    }

    return data;
}

/**
 * Invalidate cache for a specific key
 */
export async function invalidateCache(key: string) {
    try {
        await redis.del(key);
    } catch (e) {
        console.warn('Redis Cache Error (Del):', e);
    }
}
