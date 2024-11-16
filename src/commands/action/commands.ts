import { InteractionBase } from '../base/interaction_base.js';
import setMemoAction from './SetMemoAction.js';
import eventGameCommands from './event_game_command/commands.js';
import eventReviewCommands from './event_review_command/commands.js';
import statusGameMenuAction from './StatusGameMenuAction.js';
import eventPanelCommands from './event_panel_command/commands.js';
import setupUserSelectAction from './event_setup_command/SetupUserSelectAction.js';

const commands: InteractionBase[] = [
  setMemoAction,
  statusGameMenuAction,
  ...eventGameCommands,
  ...eventReviewCommands,
  ...eventPanelCommands,
  setupUserSelectAction,
];

export default commands;
