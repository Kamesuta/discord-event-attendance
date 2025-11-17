import { InteractionBase } from '@/commands/base/interactionBase';
import { gameClearButtonAction } from './GameClearButtonAction.js';
import { gameConfirmButtonAction } from './GameConfirmButtonAction.js';
import { gameDeleteButtonAction } from './GameDeleteButtonAction.js';
import { gameEditButtonAction } from './GameEditButtonAction.js';
import { gameEditModalAction } from './GameEditModalAction.js';

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
