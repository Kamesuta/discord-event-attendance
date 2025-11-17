import { InteractionBase } from '../base/interactionBase.js';
import { setMemoAction } from './SetMemoAction.js';
import { eventGameActions } from './eventGameCommand/commands.js';
import { eventReviewActions } from './eventReviewCommand/commands.js';
import { statusGameMenuAction } from './StatusGameMenuAction.js';
import { eventPanelActions } from './eventPanelCommand/commands.js';
import { eventSetupActions } from './eventSetupCommand/commands.js';
import { preparationStatusActions } from './preparationStatusCommand/commands.js';
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
