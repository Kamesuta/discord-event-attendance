import { InteractionBase } from '../base/interactionBase.js';
import { eventCommand } from './EventCommand.js';
import { eventReviewCommand } from './EventReviewCommand.js';
import { eventGameCommand } from './EventGameCommand.js';
import { eventUserListCommand } from './EventUserListCommand.js';
import { eventGameCsvCommand } from './EventGameCsvCommand.js';

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
