import { InteractionBase } from '../../base/interaction_base.js';
import gameEditButtonAction from './GameEditButtonAction.js';
import gameEditModalAction from './GameEditModalAction.js';

const commands: InteractionBase[] = [gameEditButtonAction, gameEditModalAction];

export default commands;
