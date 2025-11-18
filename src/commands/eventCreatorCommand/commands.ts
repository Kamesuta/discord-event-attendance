import { InteractionBase } from '@/commands/base/interactionBase';
import { eventCreatorCommand } from './EventCreatorCommand';
import { eventCreatorCreateCommand } from './EventCreatorCreateCommand';
import { eventCreatorImportCommand } from './EventCreatorImportCommand';
import { eventCreatorScheduleCommand } from './EventCreatorScheduleCommand';
import { eventCreatorPreparationPanelCommand } from './EventCreatorPreparationPanelCommand';
import { eventCreatorScheduleCopyCommand } from './EventCreatorScheduleCopyCommand';
import { eventCreatorSetupCommand } from './EventCreatorSetupCommand';

/**
 * イベント作成者コマンドの配列
 */
export const eventCreatorCommands: InteractionBase[] = [
  eventCreatorCommand,
  eventCreatorCreateCommand,
  eventCreatorImportCommand,
  eventCreatorScheduleCommand,
  eventCreatorPreparationPanelCommand,
  eventCreatorScheduleCopyCommand,
  eventCreatorSetupCommand,
];
