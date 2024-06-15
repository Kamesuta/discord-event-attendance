-- DropForeignKey
ALTER TABLE `UserGameResult` DROP FOREIGN KEY `UserGameResult_gameId_fkey`;

-- AddForeignKey
ALTER TABLE `UserGameResult` ADD CONSTRAINT `UserGameResult_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `GameResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
