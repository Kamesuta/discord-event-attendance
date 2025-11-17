import { InteractionBase } from '../base/interactionBase.js';
import { statusCommand } from './StatusCommand.js';
import { statusUserCommand } from './StatusUserCommand.js';
import { statusEventCommand } from './StatusEventCommand.js';
import { statusGameCommand } from './StatusGameCommand.js';
import { statusEventListCommand } from './StatusEventListCommand.js';
import { statusRankingCommand } from './StatusRankingCommand.js';

/**
 * ステータスコマンドの配列
 */
export const statusCommands: InteractionBase[] = [
  statusCommand,
  statusUserCommand,
  statusEventCommand,
  statusEventListCommand,
  statusGameCommand,
  statusRankingCommand,
];
