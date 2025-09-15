import { InteractionBase } from '../../base/interaction_base.js';
import setupEventSelectAction from './SetupEventSelectAction.js';
import setupUserSelectAction from './SetupUserSelectAction.js';
import setupPreparerSelectAction from './SetupPreparerSelectAction.js';

const commands: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
  setupPreparerSelectAction,
];

export default commands;
