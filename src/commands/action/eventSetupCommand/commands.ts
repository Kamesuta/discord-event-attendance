import { InteractionBase } from '@/commands/base/interactionBase';
import { setupEventSelectAction } from './SetupEventSelectAction';
import { setupUserSelectAction } from './SetupUserSelectAction';
import { setupPreparerSelectAction } from './SetupPreparerSelectAction';
import { setupTagEditAction } from './SetupTagEditAction';
import { setupTagEditModalAction } from './SetupTagEditModalAction';
import { setupTagConfirmAction } from './SetupTagConfirmAction';

/**
 * イベントセットアップアクションの配列
 */
export const eventSetupActions: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
  setupPreparerSelectAction,
  setupTagEditAction,
  setupTagEditModalAction,
  setupTagConfirmAction,
];
