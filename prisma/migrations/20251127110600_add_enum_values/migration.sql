-- AlterEnum: Add 'queued' and 'failed' to MusicStatus
ALTER TYPE "MusicStatus" ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE "MusicStatus" ADD VALUE IF NOT EXISTS 'failed';

-- AlterEnum: Add 'queued', 'processing', and 'failed' to SceneStatus
ALTER TYPE "SceneStatus" ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE "SceneStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "SceneStatus" ADD VALUE IF NOT EXISTS 'failed';
