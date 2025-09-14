-- AlterTable
ALTER TABLE `Event` ADD COLUMN `preparerId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_preparerId_fkey` FOREIGN KEY (`preparerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
