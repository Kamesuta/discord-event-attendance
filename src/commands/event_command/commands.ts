import { InteractionBase } from '../base/interaction_base.js';
import eventCommand from './EventCommand.js';
import eventReviewCommand from './EventReviewCommand.js';
import eventGameCommand from './EventGameCommand.js';
import eventUserListCommand from './EventUserListCommand.js';
import eventGameCsvCommand from './EventGameCsvCommand.js';

const commands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventGameCommand,
  eventUserListCommand,
  eventGameCsvCommand,
];

export default commands;
