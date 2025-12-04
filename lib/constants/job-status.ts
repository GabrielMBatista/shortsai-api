/**
 * Job Status Enum
 * Represents the current state of a background job
 */
export enum JobStatus {
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

/**
 * Job Type Enum
 * Represents the type of background job being processed
 */
export enum JobType {
    VIDEO_GENERATION = 'VIDEO_GENERATION',
    TTS_GENERATION = 'TTS_GENERATION',
    IMAGE_GENERATION = 'IMAGE_GENERATION',
    MUSIC_GENERATION = 'MUSIC_GENERATION'
}

/**
 * Scene Status Values
 * String literal union type matching Prisma SceneStatus enum
 */
export type SceneStatusValue = 'draft' | 'pending' | 'queued' | 'processing' | 'loading' | 'completed' | 'failed' | 'error';

/**
 * Scene Status Constants
 * Type-safe constants for scene status
 */
export const SceneStatus = {
    DRAFT: 'draft' as SceneStatusValue,
    PENDING: 'pending' as SceneStatusValue,
    QUEUED: 'queued' as SceneStatusValue,
    PROCESSING: 'processing' as SceneStatusValue,
    LOADING: 'loading' as SceneStatusValue,
    COMPLETED: 'completed' as SceneStatusValue,
    FAILED: 'failed' as SceneStatusValue,
    ERROR: 'error' as SceneStatusValue
} as const;
