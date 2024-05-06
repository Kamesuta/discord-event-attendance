/*
  Warnings:

  - A unique constraint covering the columns `[eventId]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Event` ADD COLUMN `coverImage` VARCHAR(512) NULL,
    ADD COLUMN `description` VARCHAR(4096) NULL,
    MODIFY `active` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `startTime` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Event_eventId_key` ON `Event`(`eventId`);
