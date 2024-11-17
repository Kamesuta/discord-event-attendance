import { InteractionBase } from '../../base/interaction_base.js';
import setupEventSelectAction from './SetupEventSelectAction.js';
import setupUserSelectAction from './SetupUserSelectAction.js';

const commands: InteractionBase[] = [
  setupEventSelectAction,
  setupUserSelectAction,
];

export default commands;
