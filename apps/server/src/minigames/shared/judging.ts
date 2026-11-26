import type { MinigameSettings, RouletteBets } from '@party/contracts';
import type { Fairness } from './fairness.js';
import type { MinigameRun } from './rules.js';

export interface ClaimedResult {
  value: number;
  early?: true | undefined;
  brickTrace?: string | undefined;
  stroke?: number[] | undefined;
  graphLine?: number[] | undefined;
  teamId?: string | undefined;
  bets?: RouletteBets | undefined;
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
  bets?: RouletteBets;
}

export type ResultJudge = (input: {
  settings: MinigameSettings;
  run: MinigameRun;
  value: ClaimedResult;
  at: number;
  started: number;
  fair: Fairness;
}) => JudgedResult;
