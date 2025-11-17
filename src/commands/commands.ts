import { InteractionBase } from './base/interaction_base.js';
import { eventCommands } from './event_command/commands.js';
import { eventAdminCommands } from './event_admin_command/commands.js';
import { eventCreatorCommands } from './event_creator_command/commands.js';
import { eventOpCommands } from './event_op_command/commands.js';
import { statusCommands } from './status_command/commands.js';
import { contextMenuCommands } from './contextmenu/commands.js';
import { actionCommands } from './action/commands.js';

/**
 * 全コマンドの配列
 */
export const commands: InteractionBase[] = [
  ...eventCommands,
  ...eventAdminCommands,
  ...eventCreatorCommands,
  ...eventOpCommands,
  ...statusCommands,
  ...contextMenuCommands,
  ...actionCommands,
];
