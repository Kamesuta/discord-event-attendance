import { InteractionBase } from '../base/interaction_base.js';
import setMemoAction from './SetMemoAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';
import eventGameCommands from './event_game_command/commands.js';
import statusGameMenuAction from './StatusGameMenuAction.js';

const commands: InteractionBase[] = [
  setMemoAction,
  reviewMarkUserSelectAction,
  statusGameMenuAction,
  ...eventGameCommands,
];

export default commands;
