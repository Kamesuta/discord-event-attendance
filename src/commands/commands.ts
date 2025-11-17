import { InteractionBase } from './base/interactionBase.js';
import { eventCommands } from './eventCommand/commands.js';
import { eventAdminCommands } from './eventAdminCommand/commands.js';
import { eventCreatorCommands } from './eventCreatorCommand/commands.js';
import { eventOpCommands } from './eventOpCommand/commands.js';
import { statusCommands } from './statusCommand/commands.js';
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
