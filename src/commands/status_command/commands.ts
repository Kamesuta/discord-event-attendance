import { InteractionBase } from '../base/interaction_base.js';
import statusUserCommand from './StatusUserCommand.js';
import statusEventCommand from './StatusEventCommand.js';
import statusGameCommand from './StatusGameCommand.js';
import statusCommand from './StatusCommand.js';

const commands: InteractionBase[] = [
  statusCommand,
  statusUserCommand,
  statusEventCommand,
  statusGameCommand,
];

export default commands;
