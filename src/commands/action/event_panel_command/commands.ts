import { InteractionBase } from '../../base/interaction_base.js';
import panelReviewButtonAction from './PanelReviewButtonAction.js';
import panelStartButtonAction from './PanelStartButtonAction.js';
import panelStopButtonAction from './PanelStopButtonAction.js';
import panelStopConfirmModalAction from './PanelStopConfirmModalAction.js';

const commands: InteractionBase[] = [
  panelStartButtonAction,
  panelReviewButtonAction,
  panelStopButtonAction,
  panelStopConfirmModalAction,
];

export default commands;
