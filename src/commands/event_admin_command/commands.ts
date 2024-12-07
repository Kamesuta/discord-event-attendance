import { InteractionBase } from '../base/interaction_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import eventAdminStartCommand from './EventAdminStartCommand.js';
import eventAdminStopCommand from './EventAdminStopCommand.js';
import eventAdminRecalcTimeCommand from './EventAdminRecalcTimeCommand.js';
import eventAdminSyncRoleCommand from './EventAdminSyncRoleCommand.js';

const commands: InteractionBase[] = [
  eventAdminCommand,
  eventAdminStartCommand,
  eventAdminStopCommand,
  eventAdminRecalcTimeCommand,
  eventAdminSyncRoleCommand,
];

export default commands;
