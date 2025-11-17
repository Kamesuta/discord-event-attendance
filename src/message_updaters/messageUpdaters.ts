import { MessageUpdater } from './MessageUpdater.js';
import { eventInfoMessageUpdater } from './EventInfoMessageUpdater.js';
import { calendarMessageUpdater } from './CalendarMessageUpdater.js';
import { detailMessageUpdater } from './DetailMessageUpdater.js';
import { preparationStatusMessageUpdater } from './PreparationStatusMessageUpdater.js';

/**
 * 登録するMessageUpdaterの一覧
 */
export const messageUpdaters: MessageUpdater[] = [
  eventInfoMessageUpdater,
  calendarMessageUpdater,
  detailMessageUpdater,
  preparationStatusMessageUpdater,
];
