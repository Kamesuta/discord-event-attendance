import eventInfoMessageUpdater from './EventInfoMessageUpdater.js';
import calendarMessageUpdater from '../commands/event_creator_command/schedule/CalendarMessageUpdater.js';
import detailMessageUpdater from '../commands/event_creator_command/schedule/DetailMessageUpdater.js';
import { MessageUpdater } from './MessageUpdater.js';

/**
 * 登録するMessageUpdaterの一覧
 */
const messageUpdaters: MessageUpdater[] = [
  eventInfoMessageUpdater,
  calendarMessageUpdater,
  detailMessageUpdater,
];

export default messageUpdaters;
