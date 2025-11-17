import { InteractionBase } from '@/commands/base/interactionBase';
import { reviewFilterMarkButtonAction } from './ReviewFilterMarkButtonAction.js';
import { reviewFilterMarkModalAction } from './ReviewFilterMarkModalAction.js';
import { reviewMarkClearButtonAction } from './ReviewMarkClearButtonAction.js';
import { reviewMarkUndoButtonAction } from './ReviewMarkUndoButtonAction.js';
import { reviewMarkUserSelectAction } from './ReviewMarkUserSelectAction.js';
import { reviewPasteButtonAction } from './ReviewPasteButtonAction.js';
import { reviewPasteModalAction } from './ReviewPasteModalAction.js';

/**
 * イベントレビューアクションの配列
 */
export const eventReviewActions: InteractionBase[] = [
  reviewMarkUserSelectAction,
  reviewMarkClearButtonAction,
  reviewMarkUndoButtonAction,
  reviewFilterMarkButtonAction,
  reviewFilterMarkModalAction,
  reviewPasteButtonAction,
  reviewPasteModalAction,
];
