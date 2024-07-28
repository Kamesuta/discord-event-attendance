import { InteractionBase } from '../../base/interaction_base.js';
import panelReviewButtonAction from './PanelReviewButtonAction.js';
import panelStartButtonAction from './PanelStartButtonAction.js';
import panelStopButtonAction from './PanelStopButtonAction.js';

const commands: InteractionBase[] = [
  panelStartButtonAction,
  panelReviewButtonAction,
  panelStopButtonAction,
];

export default commands;
