import { InteractionBase } from '@/commands/base/interactionBase';
import { preparationStatusReportButtonAction } from './PreparationStatusReportButtonAction.js';
import { preparationStatusToggleSelectAction } from './PreparationStatusToggleSelectAction.js';

/**
 * 準備状況アクションの配列
 */
export const preparationStatusActions: InteractionBase[] = [
  preparationStatusReportButtonAction,
  preparationStatusToggleSelectAction,
];
