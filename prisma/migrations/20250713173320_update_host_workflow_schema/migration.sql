-- Step 1: Add workflowId column as nullable first
ALTER TABLE `HostRequest` ADD COLUMN `workflowId` INTEGER;

-- Step 2: Data migration - match HostRequest to HostWorkflow by eventId
UPDATE `HostRequest` 
SET `workflowId` = (
  SELECT hw.id 
  FROM `HostWorkflow` hw 
  WHERE hw.`eventId` = `HostRequest`.`eventId`
)
WHERE EXISTS (
  SELECT 1 
  FROM `HostWorkflow` hw 
  WHERE hw.`eventId` = `HostRequest`.`eventId`
);

-- Step 3: Make workflowId NOT NULL
ALTER TABLE `HostRequest` MODIFY COLUMN `workflowId` INTEGER NOT NULL;

-- Step 4: Drop old constraints and columns
-- First drop the foreign key constraint that uses eventId
ALTER TABLE `HostRequest` DROP FOREIGN KEY `HostRequest_eventId_fkey`;
-- Then drop the unique index
DROP INDEX `HostRequest_eventId_userId_key` ON `HostRequest`;
-- Finally drop the eventId column
ALTER TABLE `HostRequest` DROP COLUMN `eventId`;

-- Step 5: Update status column to ENUM
ALTER TABLE `HostRequest` MODIFY COLUMN `status` ENUM('WAITING', 'PENDING', 'ACCEPTED', 'DECLINED') 
DEFAULT 'WAITING';

-- Step 6: Update existing status values
UPDATE `HostRequest` SET `status` = 
  CASE 
    WHEN `status` = 'pending' THEN 'PENDING'
    WHEN `status` = 'accepted' THEN 'ACCEPTED'
    WHEN `status` = 'declined' THEN 'DECLINED'
    WHEN `status` = 'expired' THEN 'DECLINED'
    ELSE 'WAITING'
  END;

-- Step 7: Drop old columns from HostWorkflow
ALTER TABLE `HostWorkflow` 
DROP COLUMN `currentPriority`,
DROP COLUMN `customMessage`, 
DROP COLUMN `status`;

-- Step 8: Create new indexes and constraints
CREATE UNIQUE INDEX `HostRequest_workflowId_userId_key` ON `HostRequest`(`workflowId`, `userId`);
CREATE UNIQUE INDEX `HostRequest_workflowId_priority_key` ON `HostRequest`(`workflowId`, `priority`);
CREATE INDEX `HostRequest_workflowId_fkey` ON `HostRequest`(`workflowId`);

-- Step 9: Add foreign key constraint
ALTER TABLE `HostRequest` ADD CONSTRAINT `HostRequest_workflowId_fkey` 
FOREIGN KEY (`workflowId`) REFERENCES `HostWorkflow`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Modify status column to be NOT NULL with default value 'WAITING'
ALTER TABLE `HostRequest` MODIFY `status` ENUM('WAITING', 'PENDING', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'WAITING';
