import { InteractionBase } from '@/commands/base/interactionBase';
import { setMemoAction } from './SetMemoAction';
import { eventGameActions } from './eventGameCommand/commands';
import { eventReviewActions } from './eventReviewCommand/commands';
import { statusGameMenuAction } from './StatusGameMenuAction';
import { eventPanelActions } from './eventPanelCommand/commands';
import { eventSetupActions } from './eventSetupCommand/commands';
import { preparationStatusActions } from './preparationStatusCommand/commands';
import { addRoleButtonAction } from './AddRoleButtonAction';

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
