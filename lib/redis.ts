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
