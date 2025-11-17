import { InteractionBase } from '@/commands/base/interactionBase';
import { eventAdminCommand } from './EventAdminCommand.js';
import { eventAdminStartCommand } from './EventAdminStartCommand.js';
import { eventAdminStopCommand } from './EventAdminStopCommand.js';
import { eventAdminRecalcTimeCommand } from './EventAdminRecalcTimeCommand.js';
import { eventAdminSyncRoleCommand } from './EventAdminSyncRoleCommand.js';

/**
 * イベント管理者コマンドの配列
 */
export const eventAdminCommands: InteractionBase[] = [
  eventAdminCommand,
  eventAdminStartCommand,
  eventAdminStopCommand,
  eventAdminRecalcTimeCommand,
  eventAdminSyncRoleCommand,
];
