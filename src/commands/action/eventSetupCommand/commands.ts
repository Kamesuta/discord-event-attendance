import { InteractionBase } from '@/commands/base/interactionBase';
import { setupEventSelectAction } from './SetupEventSelectAction';
import { setupUserSelectAction } from './SetupUserSelectAction';
import { setupPreparerSelectAction } from './SetupPreparerSelectAction';

/**
 * イベントセットアップアクションの配列
 */
export const eventSetupActions: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
  setupPreparerSelectAction,
];
