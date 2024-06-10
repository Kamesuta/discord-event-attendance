import { InteractionBase } from '../base/interaction_base.js';
import eventCommand from './EventCommand.js';
import eventReviewCommand from './EventReviewCommand.js';
import eventShowCommand from './EventShowCommand.js';
import eventGameCommand from './EventGameCommand.js';

const commands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventShowCommand,
  eventGameCommand,
];

export default commands;
