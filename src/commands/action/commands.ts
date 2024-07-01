import { InteractionBase } from '../base/interaction_base.js';
import setMemoAction from './SetMemoAction.js';
import eventGameCommands from './event_game_command/commands.js';
import eventReviewCommands from './event_review_command/commands.js';
import statusGameMenuAction from './StatusGameMenuAction.js';

const commands: InteractionBase[] = [
  setMemoAction,
  statusGameMenuAction,
  ...eventGameCommands,
  ...eventReviewCommands,
];

export default commands;
