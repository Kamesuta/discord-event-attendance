import { InteractionBase } from '@/commands/base/interactionBase';
import { panelReviewButtonAction } from './PanelReviewButtonAction';
import { panelStartButtonAction } from './PanelStartButtonAction';
import { panelStopButtonAction } from './PanelStopButtonAction';
import { panelStopConfirmModalAction } from './PanelStopConfirmModalAction';

/**
 * イベントパネルアクションの配列
 */
export const eventPanelActions: InteractionBase[] = [
  panelStartButtonAction,
  panelReviewButtonAction,
  panelStopButtonAction,
  panelStopConfirmModalAction,
];
