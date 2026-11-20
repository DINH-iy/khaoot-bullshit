import type { MinigameSettings } from '@party/contracts';
import type { Fairness } from './fairness.js';
import type { MinigameRun } from './rules.js';

export interface ClaimedResult {
  value: number;
  early?: true | undefined;
  stroke?: number[] | undefined;
  graphLine?: number[] | undefined;
  teamId?: string | undefined;
}

export interface JudgedResult {
  value: number;
  early?: true;
  stroke?: number[];
  teamId?: string;
  cut?: number;
  angle?: number;
  dotGuess?: number;
  graphLine?: number[];
}

export type ResultJudge = (input: {
  settings: MinigameSettings;
  run: MinigameRun;
  value: ClaimedResult;
  at: number;
  started: number;
  fair: Fairness;
}) => JudgedResult;
