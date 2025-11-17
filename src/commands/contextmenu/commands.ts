import { InteractionBase } from '../base/interactionBase.js';
import { statusUserMenu } from './StatusUserMenu.js';
import { markShowUserMenu } from './MarkShowUserMenu.js';
import { markHideUserMenu } from './MarkHideUserMenu.js';
import { setMemoUserMenu } from './SetMemoUserMenu.js';
import { updateEventMessageMenu } from './UpdateEventMessageMenu.js';
import { muteUserMenu } from './MuteUserMenu.js';

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
