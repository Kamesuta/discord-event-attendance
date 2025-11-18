import { MessageUpdater } from './MessageUpdater';
import { eventInfoMessageUpdater } from './EventInfoMessageUpdater';
import { calendarMessageUpdater } from './CalendarMessageUpdater';
import { detailMessageUpdater } from './DetailMessageUpdater';
import { preparationStatusMessageUpdater } from './PreparationStatusMessageUpdater';

/**
 * 登録するMessageUpdaterの一覧
 */
export const messageUpdaters: MessageUpdater[] = [
  eventInfoMessageUpdater,
  calendarMessageUpdater,
  detailMessageUpdater,
  preparationStatusMessageUpdater,
];
