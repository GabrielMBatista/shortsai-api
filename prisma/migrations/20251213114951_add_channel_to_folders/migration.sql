-- AlterTable: Add channel_id to folders (nullable for backward compatibility)
ALTER TABLE "folders" ADD COLUMN "channel_id" VARCHAR;

-- AddForeignKey: Link folders to channels
ALTER TABLE "folders" ADD CONSTRAINT "folders_channel_id_fkey" 
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: Optimize queries by user + channel
CREATE INDEX "folders_user_id_channel_id_idx" ON "folders"("user_id", "channel_id");
