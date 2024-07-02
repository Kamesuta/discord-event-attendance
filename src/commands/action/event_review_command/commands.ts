import { InteractionBase } from '../../base/interaction_base.js';
import reviewMarkClearButtonAction from './ReviewMarkClearButtonAction.js';
import reviewMarkUndoButtonAction from './ReviewMarkUndoButtonAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';

const commands: InteractionBase[] = [
  reviewMarkUserSelectAction,
  reviewMarkClearButtonAction,
  reviewMarkUndoButtonAction,
];

export default commands;
