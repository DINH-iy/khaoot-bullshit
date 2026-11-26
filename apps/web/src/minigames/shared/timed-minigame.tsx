import type { ComponentType } from 'react';
import { brickMap, type BrickSettings, type DotPattern, type GraphRoundView, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { Countdown, type Result } from './countdown.js';
import { PerfectCircle } from '../perfect-circle/perfect-circle.js';
import { ReactionPad } from '../reaction/reaction.js';
import { StopClock } from '../stop-clock/stop-clock.js';
import { TapRace } from '../tap-race/tap-race.js';
import { CutLine } from '../cut-the-line/cut-line.js';
import { MatchAngle } from '../match-the-angle/match-angle.js';
import { DotPhone } from '../count-the-dots/count-dots.js';
import { CoinPhone } from '../heads-or-tails/coin.js';
import { RoulettePhone } from '../red-or-black-roulette/roulette.js';
import { GraphPhone } from '../draw-the-graph/graph-phone.js';
import { BrickRallyBoard } from '../brick-rally/board.js';
import { ClapBeat } from '../clap-beat/clap-beat.js';
import './minigames.css';

const CONTROLLERS = { reaction: ReactionPad, 'tap-race': TapRace, 'clap-beat': ClapBeat, 'stop-clock': StopClock, 'perfect-circle': PerfectCircle };
interface Props {
  settings: MinigameSettings;
  startsAt: string;
  goAt: string | null;
  cutTarget?: number | undefined;
  angleTarget?: number | undefined;
  graph?: GraphRoundView | undefined;
  /** Count the dots: when guessing starts, and (only with no screen watching) the dots themselves. */
  dots?: { guessAt: string; pattern?: DotPattern | undefined } | undefined;
  /** Roulette: how many points this player may bet. */
  rouletteLimit?: number | undefined;
  offset: number;
  disabled: boolean;
  onResult: (result: Result) => void;
  onTaps: (count: number) => void;
}

export function TimedMinigame({ game, ...props }: Props & { game: MinigameKey }) {
  const Controller = CONTROLLERS[game as keyof typeof CONTROLLERS] as ComponentType<Props> | undefined;
  const { cutTarget, angleTarget, graph, dots, startsAt, offset, disabled, onResult, rouletteLimit } = props;
  const targetController = game === 'cut-the-line' && cutTarget !== undefined ? <CutLine target={cutTarget} disabled={disabled} onResult={onResult} />
    : game === 'match-the-angle' && angleTarget !== undefined ? <MatchAngle target={angleTarget} disabled={disabled} onResult={onResult} />
    : graph ? <GraphPhone graph={graph} disabled={disabled} onResult={onResult} />
    : game === 'count-the-dots' ? <DotPhone pattern={dots?.pattern} guessAt={dots?.guessAt} offset={offset} disabled={disabled} onResult={onResult} />
    : game === 'heads-or-tails' ? <CoinPhone disabled={disabled} onResult={onResult} />
    : game === 'red-or-black-roulette' ? <RoulettePhone limit={rouletteLimit ?? 0} disabled={disabled} onResult={onResult} />
    : game === 'brick-rally' ? <BrickRallyBoard map={brickMap(props.settings as BrickSettings)} disabled={disabled} onClear={onResult} />
    : null;
  return Controller || targetController ? <div className={`mg-play mg-${game}`}>
    {Controller ? <Controller key={startsAt} {...props} /> : <Countdown key={startsAt} startsAt={startsAt} offset={offset}>
      {targetController}
    </Countdown>}
  </div> : null;
}
