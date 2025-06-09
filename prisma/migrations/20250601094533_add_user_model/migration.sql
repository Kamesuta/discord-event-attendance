/*
  Warnings:

  - You are about to alter the column `hostId` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `userId` on the `UserGameResult` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `userId` on the `UserMute` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `UserStat` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `userId` on the `UserStat` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `userId` on the `VoiceLog` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- 既存の外部キー制約を削除
ALTER TABLE `VoiceLog` DROP FOREIGN KEY `VoiceLog_eventId_fkey`;
ALTER TABLE `VoiceLog` DROP FOREIGN KEY `VoiceLog_eventId_userId_fkey`;
ALTER TABLE `UserStat` DROP FOREIGN KEY `UserStat_eventId_fkey`;
ALTER TABLE `UserGameResult` DROP FOREIGN KEY `UserGameResult_eventId_fkey`;
ALTER TABLE `UserGameResult` DROP FOREIGN KEY `UserGameResult_gameId_fkey`;
ALTER TABLE `UserMute` DROP FOREIGN KEY `UserMute_eventId_fkey`;

-- 既存のインデックスを削除
DROP INDEX `VoiceLog_eventId_userId_fkey` ON `VoiceLog`;

-- 一時テーブルを作成して既存のユーザーIDを保存
CREATE TABLE `TempUserIds` (
    `snowflakeId` VARCHAR(191) NOT NULL,
    PRIMARY KEY (`snowflakeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 既存のユーザーIDを一時テーブルに保存
INSERT INTO `TempUserIds` (`snowflakeId`)
SELECT DISTINCT `userId` FROM `VoiceLog`
UNION
SELECT DISTINCT `userId` FROM `UserStat`
UNION
SELECT DISTINCT `userId` FROM `UserGameResult`
UNION
SELECT DISTINCT `userId` FROM `UserMute`
UNION
SELECT DISTINCT `hostId` FROM `Event` WHERE `hostId` IS NOT NULL;

-- 新しいUserテーブルを作成
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `memberName` VARCHAR(191) NULL,
    `avatarURL` VARCHAR(191) NULL,
    `memberAvatarURL` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `User_userId_key` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 一時テーブルのデータを新しいUserテーブルに移行
INSERT INTO `User` (`userId`, `createdAt`, `updatedAt`)
SELECT 
    `snowflakeId`,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `TempUserIds`;

-- 各テーブルのuserIdを新しいUserテーブルのidに更新
UPDATE `Event` e
JOIN `User` u ON e.`hostId` = u.`userId`
SET e.`hostId` = u.`id`;

UPDATE `VoiceLog` v
JOIN `User` u ON v.`userId` = u.`userId`
SET v.`userId` = u.`id`;

UPDATE `UserStat` s
JOIN `User` u ON s.`userId` = u.`userId`
SET s.`userId` = u.`id`;

UPDATE `UserMute` m
JOIN `User` u ON m.`userId` = u.`userId`
SET m.`userId` = u.`id`;

UPDATE `UserGameResult` g
JOIN `User` u ON g.`userId` = u.`userId`
SET g.`userId` = u.`id`;

-- 各テーブルのuserIdを数値型に変換
ALTER TABLE `Event` MODIFY `hostId` INTEGER NULL;
ALTER TABLE `UserGameResult` MODIFY `userId` INTEGER NOT NULL;
ALTER TABLE `UserMute` MODIFY `userId` INTEGER NOT NULL;
ALTER TABLE `UserStat` DROP PRIMARY KEY,
    MODIFY `userId` INTEGER NOT NULL,
    ADD PRIMARY KEY (`eventId`, `userId`);
ALTER TABLE `VoiceLog` MODIFY `userId` INTEGER NOT NULL;

-- 外部キー制約を再設定
ALTER TABLE `Event` ADD CONSTRAINT `Event_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VoiceLog` ADD CONSTRAINT `VoiceLog_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VoiceLog` ADD CONSTRAINT `VoiceLog_eventId_userId_fkey` FOREIGN KEY (`eventId`, `userId`) REFERENCES `UserStat`(`eventId`, `userId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VoiceLog` ADD CONSTRAINT `VoiceLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserStat` ADD CONSTRAINT `UserStat_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserStat` ADD CONSTRAINT `UserStat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserMute` ADD CONSTRAINT `UserMute_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `UserMute` ADD CONSTRAINT `UserMute_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserGameResult` ADD CONSTRAINT `UserGameResult_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserGameResult` ADD CONSTRAINT `UserGameResult_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `GameResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserGameResult` ADD CONSTRAINT `UserGameResult_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 一時テーブルを削除
DROP TABLE `TempUserIds`;
