import { InteractionBase } from './base/interactionBase';
import { eventCommands } from './eventCommand/commands';
import { eventAdminCommands } from './eventAdminCommand/commands';
import { eventCreatorCommands } from './eventCreatorCommand/commands';
import { eventOpCommands } from './eventOpCommand/commands';
import { statusCommands } from './statusCommand/commands';
import { contextMenuCommands } from './contextmenu/commands';
import { actionCommands } from './action/commands';

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
