import { InteractionBase } from '../base/interaction_base.js';
import setMemoAction from './SetMemoAction.js';
import reviewMarkUserSelectAction from './ReviewMarkUserSelectAction.js';

const commands: InteractionBase[] = [setMemoAction, reviewMarkUserSelectAction];

export default commands;
