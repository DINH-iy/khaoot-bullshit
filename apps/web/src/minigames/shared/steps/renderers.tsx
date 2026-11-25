import type { MinigameKey } from '@party/contracts';
import { bus } from '../../bus/board.js';
import { doors } from '../../lucky-doors/board.js';
import { majority } from '../../majority/board.js';
import { speedRunRenderer } from '../../speed-run/speed-run.js';
import { hangman } from '../../hangman/board.js';
import type { StepRenderer } from './step-game.js';

export const STEP_RENDERERS: Partial<Record<MinigameKey, StepRenderer>> = { bus, 'lucky-doors': doors, majority, 'speed-run': speedRunRenderer, hangman };
