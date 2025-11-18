import { InteractionBase } from '@/commands/base/interactionBase';
import { gameClearButtonAction } from './GameClearButtonAction';
import { gameConfirmButtonAction } from './GameConfirmButtonAction';
import { gameDeleteButtonAction } from './GameDeleteButtonAction';
import { gameEditButtonAction } from './GameEditButtonAction';
import { gameEditModalAction } from './GameEditModalAction';

/**
 * イベントゲームアクションの配列
 */
export const eventGameActions: InteractionBase[] = [
  gameEditButtonAction,
  gameEditModalAction,
  gameClearButtonAction,
  gameDeleteButtonAction,
  gameConfirmButtonAction,
];
