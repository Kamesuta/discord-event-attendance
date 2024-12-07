import { InteractionBase } from '../base/interaction_base.js';
import eventOpAnnounceCommand from './EventOpAnnounceCommand.js';
import eventOpCommand from './EventOpCommand.js';
import eventOpPanelCommand from './EventOpPanelCommand.js';
import eventOpSelectCommand from './EventOpSelectCommand.js';
import eventOpShowCommand from './EventOpShowCommand.js';
import eventOpUpdateCommand from './EventOpUpdateCommand.js';
import eventOpUpdateMessageCommand from './EventOpUpdateMessageCommand.js';

const commands: InteractionBase[] = [
  eventOpCommand,
  eventOpAnnounceCommand,
  eventOpPanelCommand,
  eventOpSelectCommand,
  eventOpShowCommand,
  eventOpUpdateCommand,
  eventOpUpdateMessageCommand,
];

export default commands;
