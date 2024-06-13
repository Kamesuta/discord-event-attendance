import { InteractionBase } from '../../base/interaction_base.js';
import gameClearButtonAction from './GameClearButtonAction.js';
import gameConfirmButtonAction from './GameConfirmButtonAction.js';
import gameDeleteButtonAction from './GameDeleteButtonAction.js';
import gameEditButtonAction from './GameEditButtonAction.js';
import gameEditModalAction from './GameEditModalAction.js';

const commands: InteractionBase[] = [
  gameEditButtonAction,
  gameEditModalAction,
  gameClearButtonAction,
  gameDeleteButtonAction,
  gameConfirmButtonAction,
];

export default commands;
