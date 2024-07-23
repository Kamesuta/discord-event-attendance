-- AlterTable
ALTER TABLE `Event` MODIFY `active` INTEGER NOT NULL DEFAULT 0;

-- Update
UPDATE `Event` SET `active` = 2 WHERE `active` = 1;
UPDATE `Event` SET `active` = 3 WHERE `active` = 0 AND `startTime` IS NOT NULL;
UPDATE `Event` SET `active` = 4 WHERE `active` = 0 AND `startTime` IS NULL AND `scheduleTime` < NOW();
UPDATE `Event` SET `active` = 1 WHERE `active` = 0 AND `startTime` IS NULL AND `scheduleTime` >= NOW();
