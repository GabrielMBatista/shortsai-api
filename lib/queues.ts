import { Queue } from 'bullmq';
import { connectionOptions } from './redis';

// Define Queue Names
export const SOCIAL_POSTING_QUEUE_NAME = 'social-posting';
export const VIDEO_RENDERING_QUEUE_NAME = 'video-rendering'; // Placeholder for future migration

// Create Queues
export const socialPostingQueue = new Queue(SOCIAL_POSTING_QUEUE_NAME, {
    connection: connectionOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true,
    },
});

// Placeholder for the rendering queue expansion
// This will replace the queue.json mechanism eventually
export const videoRenderingQueue = new Queue(VIDEO_RENDERING_QUEUE_NAME, {
    connection: connectionOptions,
    defaultJobOptions: {
        attempts: 1, // Rendering is expensive, maybe don't retry automatically too much
        removeOnComplete: true,
    },
});

// Queue for Google Drive -> YouTube Transfer
export const VIDEO_TRANSFER_QUEUE_NAME = 'video-transfer';

export const videoTransferQueue = new Queue(VIDEO_TRANSFER_QUEUE_NAME, {
    connection: connectionOptions,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

export const queues = {
    socialPosting: socialPostingQueue,
    videoRendering: videoRenderingQueue,
    videoTransfer: videoTransferQueue,
};
