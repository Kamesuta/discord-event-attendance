import { InteractionBase } from '@/commands/base/interactionBase';
import { eventAdminCommand } from './EventAdminCommand';
import { eventAdminStartCommand } from './EventAdminStartCommand';
import { eventAdminStopCommand } from './EventAdminStopCommand';
import { eventAdminRecalcTimeCommand } from './EventAdminRecalcTimeCommand';
import { eventAdminSyncRoleCommand } from './EventAdminSyncRoleCommand';

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
