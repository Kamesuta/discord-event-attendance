import { InteractionBase } from '../../base/interactionBase.js';
import { panelReviewButtonAction } from './PanelReviewButtonAction.js';
import { panelStartButtonAction } from './PanelStartButtonAction.js';
import { panelStopButtonAction } from './PanelStopButtonAction.js';
import { panelStopConfirmModalAction } from './PanelStopConfirmModalAction.js';

/**
 * イベントパネルアクションの配列
 */
export const eventPanelActions: InteractionBase[] = [
  panelStartButtonAction,
  panelReviewButtonAction,
  panelStopButtonAction,
  panelStopConfirmModalAction,
];
