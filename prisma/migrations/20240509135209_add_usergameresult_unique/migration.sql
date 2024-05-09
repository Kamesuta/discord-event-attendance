/*
  Warnings:

  - A unique constraint covering the columns `[gameId,userId]` on the table `UserGameResult` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `UserGameResult_gameId_userId_key` ON `UserGameResult`(`gameId`, `userId`);
