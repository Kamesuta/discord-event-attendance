import { InteractionBase } from '@/commands/base/interactionBase';
import { eventCreatorCommand } from './EventCreatorCommand.js';
import { eventCreatorCreateCommand } from './EventCreatorCreateCommand.js';
import { eventCreatorImportCommand } from './EventCreatorImportCommand.js';
import { eventCreatorScheduleCommand } from './EventCreatorScheduleCommand.js';
import { eventCreatorPreparationPanelCommand } from './EventCreatorPreparationPanelCommand.js';
import { eventCreatorScheduleCopyCommand } from './EventCreatorScheduleCopyCommand.js';
import { eventCreatorSetupCommand } from './EventCreatorSetupCommand.js';

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
