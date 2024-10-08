import { InteractionBase } from '../base/interaction_base.js';
import statusCommand from './StatusCommand.js';
import statusUserCommand from './StatusUserCommand.js';
import statusEventCommand from './StatusEventCommand.js';
import statusGameCommand from './StatusGameCommand.js';
import statusEventListCommand from './StatusEventListCommand.js';
import statusRankingCommand from './StatusRankingCommand.js';

const commands: InteractionBase[] = [
  statusCommand,
  statusUserCommand,
  statusEventCommand,
  statusEventListCommand,
  statusGameCommand,
  statusRankingCommand,
];

export default commands;
