import { InteractionBase } from '../base/interaction_base.js';
import statusUserMenu from './StatusUserMenu.js';
import markShowUserMenu from './MarkShowUserMenu.js';
import markHideUserMenu from './MarkHideUserMenu.js';
import markClearUserMenu from './MarkClearUserMenu.js';
import setMemoUserMenu from './SetMemoUserMenu.js';
import updateEventMessageMenu from './UpdateEventMessageMenu.js';

const commands: InteractionBase[] = [
  statusUserMenu,
  markShowUserMenu,
  markHideUserMenu,
  markClearUserMenu,
  setMemoUserMenu,
  updateEventMessageMenu,
];

export default commands;
