import { InteractionBase } from './base/interaction_base.js';
import eventCommand from './event_command/EventCommand.js';
import eventReviewCommand from './event_command/EventReviewCommand.js';
import eventShowCommand from './event_command/EventShowCommand.js';
import eventGameCommand from './event_command/EventGameCommand.js';
import eventStartCommand from './event_command/EventStartCommand.js';
import eventUpdateCommand from './event_command/EventUpdateCommand.js';
import eventStopCommand from './event_command/EventStopCommand.js';
import statusCommand from './status_command/StatusCommand.js';
import statusEventCommand from './status_command/StatusEventCommand.js';
import statusUserCommand from './status_command/StatusUserCommand.js';
import statusGameCommand from './status_command/StatusGameCommand.js';
import markShowUserMenu from './contextmenu/MarkShowUserMenu.js';
import statusUserMenu from './contextmenu/StatusUserMenu.js';
import markHideUserMenu from './contextmenu/MarkHideUserMenu.js';
import markClearUserMenu from './contextmenu/MarkClearUserMenu.js';
import setMemoUserMenu from './contextmenu/SetMemoUserMenu.js';
import updateEventMessageMenu from './contextmenu/UpdateEventMessageMenu.js';
import setMemoAction from './action/SetMemoAction.js';
import reviewMarkUserSelectAction from './action/ReviewMarkUserSelectAction.js';

/**
 * 全コマンドリスト
 */
export const commands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventShowCommand,
  eventGameCommand,
  eventUpdateCommand,
  eventStartCommand,
  eventStopCommand,
  statusCommand,
  statusUserCommand,
  statusEventCommand,
  statusGameCommand,
  statusUserMenu,
  markShowUserMenu,
  markHideUserMenu,
  markClearUserMenu,
  setMemoUserMenu,
  updateEventMessageMenu,
  setMemoAction,
  reviewMarkUserSelectAction,
];
