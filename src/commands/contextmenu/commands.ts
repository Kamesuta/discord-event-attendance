import { InteractionBase } from '@/commands/base/interactionBase';
import { statusUserMenu } from './StatusUserMenu';
import { markShowUserMenu } from './MarkShowUserMenu';
import { markHideUserMenu } from './MarkHideUserMenu';
import { setMemoUserMenu } from './SetMemoUserMenu';
import { updateEventMessageMenu } from './UpdateEventMessageMenu';
import { muteUserMenu } from './MuteUserMenu';

/**
 * コンテキストメニューコマンドの配列
 */
export const contextMenuCommands: InteractionBase[] = [
  statusUserMenu,
  markShowUserMenu,
  markHideUserMenu,
  muteUserMenu,
  setMemoUserMenu,
  updateEventMessageMenu,
];
