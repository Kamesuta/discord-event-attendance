import { InteractionBase } from '@/commands/base/interactionBase';
import { eventCommand } from './EventCommand';
import { eventReviewCommand } from './EventReviewCommand';
import { eventGameCommand } from './EventGameCommand';
import { eventUserListCommand } from './EventUserListCommand';
import { eventGameCsvCommand } from './EventGameCsvCommand';

/**
 * イベントコマンドの配列
 */
export const eventCommands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventGameCommand,
  eventUserListCommand,
  eventGameCsvCommand,
];
