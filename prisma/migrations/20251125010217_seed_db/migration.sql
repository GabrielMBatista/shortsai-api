-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "TTSProvider" AS ENUM ('gemini', 'elevenlabs');

-- CreateEnum
CREATE TYPE "MusicStatus" AS ENUM ('pending', 'loading', 'completed', 'error');

-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('pending', 'loading', 'completed', 'error');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "google_id" TEXT,
    "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "user_id" TEXT NOT NULL,
    "gemini_key" TEXT,
    "elevenlabs_key" TEXT,
    "suno_key" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "voice_name" TEXT NOT NULL,
    "tts_provider" "TTSProvider" NOT NULL,
    "reference_image_url" TEXT,
    "include_music" BOOLEAN NOT NULL DEFAULT false,
    "bg_music_prompt" TEXT,
    "bg_music_url" TEXT,
    "bg_music_status" "MusicStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scene_number" INTEGER NOT NULL,
    "visual_description" TEXT NOT NULL,
    "narration" TEXT NOT NULL,
    "duration_seconds" DECIMAL(5,2) NOT NULL,
    "image_url" TEXT,
    "image_status" "SceneStatus" NOT NULL DEFAULT 'pending',
    "audio_url" TEXT,
    "audio_status" "SceneStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "scenes_project_id_idx" ON "scenes"("project_id");

-- CreateIndex
CREATE INDEX "scenes_project_id_scene_number_idx" ON "scenes"("project_id", "scene_number");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
