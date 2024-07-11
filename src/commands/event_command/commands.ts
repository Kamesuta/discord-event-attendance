import { InteractionBase } from '../base/interaction_base.js';
import eventCommand from './EventCommand.js';
import eventReviewCommand from './EventReviewCommand.js';
import eventShowCommand from './EventShowCommand.js';
import eventGameCommand from './EventGameCommand.js';
import eventUserListCommand from './EventUserListCommand.js';
import eventGameCsvCommand from './EventGameCsvCommand.js';
import eventStartCommand from './EventStartCommand.js';
import eventStopCommand from './EventStopCommand.js';

const commands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventShowCommand,
  eventGameCommand,
  eventUserListCommand,
  eventGameCsvCommand,
  eventStartCommand,
  eventStopCommand,
];

export default commands;
