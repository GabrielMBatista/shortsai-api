-- Step 1: Remove existing defaults to allow enum type changes
ALTER TABLE "scenes" ALTER COLUMN "image_status" DROP DEFAULT;
ALTER TABLE "scenes" ALTER COLUMN "audio_status" DROP DEFAULT;
ALTER TABLE "scenes" ALTER COLUMN "sfx_status" DROP DEFAULT;

-- Step 2: Add 'draft' to SceneStatus enum by recreating it
CREATE TYPE "SceneStatus_new" AS ENUM ('draft', 'pending', 'queued', 'processing', 'loading', 'completed', 'failed', 'error');
ALTER TABLE "scenes" ALTER COLUMN "image_status" TYPE "SceneStatus_new" USING ("image_status"::text::"SceneStatus_new");
ALTER TABLE "scenes" ALTER COLUMN "audio_status" TYPE "SceneStatus_new" USING ("audio_status"::text::"SceneStatus_new");
ALTER TABLE "scenes" ALTER COLUMN "sfx_status" TYPE "SceneStatus_new" USING ("sfx_status"::text::"SceneStatus_new");
DROP TYPE "SceneStatus";
ALTER TYPE "SceneStatus_new" RENAME TO "SceneStatus";

-- Step 3: Add 'draft' to MusicStatus enum by recreating it
CREATE TYPE "MusicStatus_new" AS ENUM ('draft', 'pending', 'queued', 'loading', 'completed', 'failed', 'error');
ALTER TABLE "projects" ALTER COLUMN "bg_music_status" TYPE "MusicStatus_new" USING ("bg_music_status"::text::"MusicStatus_new");
DROP TYPE "MusicStatus";
ALTER TYPE "MusicStatus_new" RENAME TO "MusicStatus";

-- Step 4: Update existing data - set status to 'draft' for items without assets that are currently 'pending'
UPDATE "scenes" SET image_status = 'draft' WHERE image_status = 'pending' AND image_url IS NULL;
UPDATE "scenes" SET audio_status = 'draft' WHERE audio_status = 'pending' AND audio_url IS NULL;
UPDATE "scenes" SET sfx_status = 'draft' WHERE sfx_status = 'pending' AND sfx_url IS NULL;
UPDATE "projects" SET bg_music_status = 'draft' WHERE bg_music_status = 'pending' AND bg_music_url IS NULL;

-- Step 5: Set new defaults to 'draft'
ALTER TABLE "scenes" ALTER COLUMN "image_status" SET DEFAULT 'draft';
ALTER TABLE "scenes" ALTER COLUMN "audio_status" SET DEFAULT 'draft';
ALTER TABLE "scenes" ALTER COLUMN "sfx_status" SET DEFAULT 'draft';
