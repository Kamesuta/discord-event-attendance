import { InteractionBase } from '@/commands/base/interactionBase';
import { setupEventSelectAction } from './SetupEventSelectAction.js';
import { setupUserSelectAction } from './SetupUserSelectAction.js';
import { setupPreparerSelectAction } from './SetupPreparerSelectAction.js';

/**
 * イベントセットアップアクションの配列
 */
export const eventSetupActions: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
  setupPreparerSelectAction,
];
