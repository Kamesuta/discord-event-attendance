import { InteractionBase } from '../../base/interaction_base.js';
import preparationStatusReportButtonAction from './PreparationStatusReportButtonAction.js';
import preparationStatusToggleSelectAction from './PreparationStatusToggleSelectAction.js';

const commands: InteractionBase[] = [
  preparationStatusReportButtonAction,
  preparationStatusToggleSelectAction,
];

export default commands;
