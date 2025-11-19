import { InteractionBase } from '@/commands/base/interactionBase';
import { reviewFilterMarkButtonAction } from './ReviewFilterMarkButtonAction';
import { reviewFilterMarkModalAction } from './ReviewFilterMarkModalAction';
import { reviewMarkClearButtonAction } from './ReviewMarkClearButtonAction';
import { reviewMarkUndoButtonAction } from './ReviewMarkUndoButtonAction';
import { reviewMarkUserSelectAction } from './ReviewMarkUserSelectAction';
import { reviewPasteButtonAction } from './ReviewPasteButtonAction';
import { reviewPasteModalAction } from './ReviewPasteModalAction';

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
