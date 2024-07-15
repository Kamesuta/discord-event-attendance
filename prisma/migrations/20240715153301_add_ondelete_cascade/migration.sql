-- DropForeignKey
ALTER TABLE `GameResult` DROP FOREIGN KEY `GameResult_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `UserGameResult` DROP FOREIGN KEY `UserGameResult_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `UserStat` DROP FOREIGN KEY `UserStat_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `VoiceLog` DROP FOREIGN KEY `VoiceLog_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `VoiceLog` DROP FOREIGN KEY `VoiceLog_eventId_userId_fkey`;

-- AddForeignKey
ALTER TABLE `VoiceLog` ADD CONSTRAINT `VoiceLog_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoiceLog` ADD CONSTRAINT `VoiceLog_eventId_userId_fkey` FOREIGN KEY (`eventId`, `userId`) REFERENCES `UserStat`(`eventId`, `userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserStat` ADD CONSTRAINT `UserStat_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameResult` ADD CONSTRAINT `GameResult_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserGameResult` ADD CONSTRAINT `UserGameResult_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
