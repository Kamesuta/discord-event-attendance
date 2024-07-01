import { InteractionBase } from '../../base/interaction_base.js';
import reviewMarkClearButtonAction from './ReviewMarkClearButtonAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';

const commands: InteractionBase[] = [
  reviewMarkUserSelectAction,
  reviewMarkClearButtonAction,
];

export default commands;
