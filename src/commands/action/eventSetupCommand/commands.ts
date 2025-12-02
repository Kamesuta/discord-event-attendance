import { InteractionBase } from '@/commands/base/interactionBase';
import { setupEventSelectAction } from './SetupEventSelectAction';
import { setupUserSelectAction } from './SetupUserSelectAction';
import { setupPreparerSelectAction } from './SetupPreparerSelectAction';
import { setupConfirmButtonAction } from './SetupConfirmButtonAction';

/**
 * イベントセットアップアクションの配列
 */
export const eventSetupActions: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
  setupPreparerSelectAction,
  setupConfirmButtonAction,
];
