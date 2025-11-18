import { InteractionBase } from '@/commands/base/interactionBase';
import { statusCommand } from './StatusCommand';
import { statusUserCommand } from './StatusUserCommand';
import { statusEventCommand } from './StatusEventCommand';
import { statusGameCommand } from './StatusGameCommand';
import { statusEventListCommand } from './StatusEventListCommand';
import { statusRankingCommand } from './StatusRankingCommand';

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
