import { InteractionBase } from '../base/interaction_base.js';
import statusUserMenu from './StatusUserMenu.js';
import markShowUserMenu from './MarkShowUserMenu.js';
import markHideUserMenu from './MarkHideUserMenu.js';
import setMemoUserMenu from './SetMemoUserMenu.js';
import updateEventMessageMenu from './UpdateEventMessageMenu.js';
import muteUserMenu from './MuteUserMenu.js';

const commands: InteractionBase[] = [
  statusUserMenu,
  markShowUserMenu,
  markHideUserMenu,
  muteUserMenu,
  setMemoUserMenu,
  updateEventMessageMenu,
];

export default commands;
