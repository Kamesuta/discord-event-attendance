/*
  Warnings:

  - You are about to alter the column `xp` on the `UserGameResult` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- AlterTable
ALTER TABLE `UserGameResult` MODIFY `xp` DOUBLE NOT NULL;
