import { InteractionBase } from '../base/interaction_base.js';
import setMemoAction from './SetMemoAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';
import eventGameCommands from './event_game_command/commands.js';

const commands: InteractionBase[] = [
  setMemoAction,
  reviewMarkUserSelectAction,
  ...eventGameCommands,
];

export default commands;
