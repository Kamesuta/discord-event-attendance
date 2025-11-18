import { InteractionBase } from '@/commands/base/interactionBase';
import { preparationStatusReportButtonAction } from './PreparationStatusReportButtonAction';
import { preparationStatusToggleSelectAction } from './PreparationStatusToggleSelectAction';

/**
 * 準備状況アクションの配列
 */
export const preparationStatusActions: InteractionBase[] = [
  preparationStatusReportButtonAction,
  preparationStatusToggleSelectAction,
];
