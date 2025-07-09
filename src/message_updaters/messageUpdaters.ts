import eventInfoMessageUpdater from './EventInfoMessageUpdater.js';
import calendarMessageUpdater from './CalendarMessageUpdater.js';
import detailMessageUpdater from './DetailMessageUpdater.js';
import hostRequestMessageUpdater from './HostRequestMessageUpdater.js';
import { MessageUpdater } from './MessageUpdater.js';

/**
 * 登録するMessageUpdaterの一覧
 */
const messageUpdaters: MessageUpdater[] = [
  eventInfoMessageUpdater,
  calendarMessageUpdater,
  detailMessageUpdater,
  hostRequestMessageUpdater,
];

export default messageUpdaters;
