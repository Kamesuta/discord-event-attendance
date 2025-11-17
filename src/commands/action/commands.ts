import { InteractionBase } from '../base/interaction_base.js';
import { setMemoAction } from './SetMemoAction.js';
import { eventGameActions } from './event_game_command/commands.js';
import { eventReviewActions } from './event_review_command/commands.js';
import { statusGameMenuAction } from './StatusGameMenuAction.js';
import { eventPanelActions } from './event_panel_command/commands.js';
import { eventSetupActions } from './event_setup_command/commands.js';
import { preparationStatusActions } from './preparation_status_command/commands.js';
import { addRoleButtonAction } from './AddRoleButtonAction.js';

/**
 * アクションコマンドの配列
 */
export const actionCommands: InteractionBase[] = [
  setMemoAction,
  statusGameMenuAction,
  addRoleButtonAction,
  ...eventGameActions,
  ...eventReviewActions,
  ...eventPanelActions,
  ...eventSetupActions,
  ...preparationStatusActions,
];
