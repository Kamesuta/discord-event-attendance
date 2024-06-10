import { InteractionBase } from './base/interaction_base.js';
import eventCommands from './event_command/commands.js';
import eventAdminCommands from './event_admin_command/commands.js';
import statusCommands from './status_command/commands.js';
import userMenuCommands from './contextmenu/commands.js';
import actionCommands from './action/commands.js';

const commands: InteractionBase[] = [
  ...eventCommands,
  ...eventAdminCommands,
  ...statusCommands,
  ...userMenuCommands,
  ...actionCommands,
];

export default commands;
