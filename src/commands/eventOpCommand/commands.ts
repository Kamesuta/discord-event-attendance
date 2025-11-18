import { InteractionBase } from '@/commands/base/interactionBase';
import { eventOpAnnounceCommand } from './EventOpAnnounceCommand';
import { eventOpCommand } from './EventOpCommand';
import { eventOpPanelCommand } from './EventOpPanelCommand';
import { eventOpSelectCommand } from './EventOpSelectCommand';
import { eventOpShowCommand } from './EventOpShowCommand';
import { eventOpUpdateCommand } from './EventOpUpdateCommand';
import { eventOpUpdateMessageCommand } from './EventOpUpdateMessageCommand';
import { eventOpTodayCommand } from './EventOpTodayCommand';

/**
 * イベント運営コマンドの配列
 */
export const eventOpCommands: InteractionBase[] = [
  eventOpCommand,
  eventOpAnnounceCommand,
  eventOpPanelCommand,
  eventOpSelectCommand,
  eventOpShowCommand,
  eventOpUpdateCommand,
  eventOpUpdateMessageCommand,
  eventOpTodayCommand,
];
