import { InteractionBase } from '../base/interaction_base.js';
import eventCreatorCommand from './EventCreatorCommand.js';
import eventCreatorCreateCommand from './EventCreatorCreateCommand.js';
import eventCreatorImportCommand from './EventCreatorImportCommand.js';
import eventCreatorScheduleCommand from './EventCreatorScheduleCommand.js';
import eventCreatorSetupCommand from './EventCreatorSetupCommand.js';

const commands: InteractionBase[] = [
  eventCreatorCommand,
  eventCreatorCreateCommand,
  eventCreatorImportCommand,
  eventCreatorScheduleCommand,
  eventCreatorSetupCommand,
];

export default commands;
