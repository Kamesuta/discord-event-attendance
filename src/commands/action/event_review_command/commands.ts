import { InteractionBase } from '../../base/interaction_base.js';
import reviewFilterMarkButtonAction from './ReviewFilterMarkButtonAction.js';
import reviewFilterMarkModalAction from './ReviewFilterMarkModalAction.js';
import reviewMarkClearButtonAction from './ReviewMarkClearButtonAction.js';
import reviewMarkUndoButtonAction from './ReviewMarkUndoButtonAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';
import reviewPasteButtonAction from './ReviewPasteButtonAction.js';
import reviewPasteModalAction from './ReviewPasteModalAction.js';

const commands: InteractionBase[] = [
  reviewMarkUserSelectAction,
  reviewMarkClearButtonAction,
  reviewMarkUndoButtonAction,
  reviewFilterMarkButtonAction,
  reviewFilterMarkModalAction,
  reviewPasteButtonAction,
  reviewPasteModalAction,
];

export default commands;
