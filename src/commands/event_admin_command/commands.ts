import { InteractionBase } from '../base/interaction_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import eventAdminSelectCommand from './EventAdminSelectCommand.js';
import eventAdminUpdateCommand from './EventAdminUpdateCommand.js';
import eventAdminUpdateMessageCommand from './EventAdminUpdateMessageCommand.js';
import eventAdminStartCommand from './EventAdminStartCommand.js';
import eventAdminStopCommand from './EventAdminStopCommand.js';
import eventAdminPanelCommand from './EventAdminPanelCommand.js';
import eventAdminCreateCommand from './EventAdminCreateCommand.js';

const commands: InteractionBase[] = [
  eventAdminCommand,
  eventAdminSelectCommand,
  eventAdminUpdateCommand,
  eventAdminUpdateMessageCommand,
  eventAdminStartCommand,
  eventAdminStopCommand,
  eventAdminPanelCommand,
  eventAdminCreateCommand,
];

export default commands;
