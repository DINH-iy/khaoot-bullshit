import { useEffect, useState } from 'react';
import { BRICK_MAX_SECONDS, type BrickChallengeView } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { H2H_TEXTS } from '../head-to-head/h2h.text.js';
import { BrickMapPreview, BrickRallyBoard } from '../minigames/brick-rally/board.js';
import { BRICK_TEXTS } from '../minigames/brick-rally/brick-rally.text.js';
import { Countdown } from '../minigames/shared/countdown.js';
import { GameSymbol } from '../presentation/game-symbol.js';
import { gameName } from '../presentation/catalog.text.js';
import { BRICK_CHALLENGE_TEXTS } from './brick-challenge.text.js';

export function BrickChallenge({ view, names, offset, busy, onReady, onClear, onResign, onDeadline }: {
  view: BrickChallengeView; names: [string, string]; offset: number; busy: boolean;
  onReady: () => void; onClear: (trace: string) => void; onResign: () => void; onDeadline: () => Promise<void>;
}) {
  const t = useTexts(BRICK_CHALLENGE_TEXTS);
  const b = useTexts(BRICK_TEXTS);
  const h = useTexts(H2H_TEXTS);
  const [confirm, setConfirm] = useState(false);
  const [expired, setExpired] = useState(false);
  const { seat, map, ready, startsAt, deadlineAt, times, outcome } = view;
  const ownTime = times[seat];

  useEffect(() => {
    if (!deadlineAt || outcome) return;
    const refreshWhenDue = () => { setExpired(true); void onDeadline(); };
    const timer = window.setTimeout(refreshWhenDue, Math.max(0, Date.parse(deadlineAt) - Date.now() - offset + 250));
    return () => window.clearTimeout(timer);
  }, [deadlineAt, offset, outcome, onDeadline]);

  return <section className="brick-challenge">
    <header className="brick-challenge-title"><span className="challenge-game-mark" data-game="brick-rally" aria-hidden="true"><GameSymbol game="brick-rally" /></span>
      <div><h3>{gameName('brick-rally')}</h3><p className="hint">{h('versus', { first: names[0], second: names[1] })}</p></div>
    </header>
    {outcome ? <div className="challenge-card brick-challenge-result" role="status">
      <strong>{outcome.kind === 'draw' ? h('draw') : outcome.reason === 'resigned'
        ? h('winsGaveUp', { name: names[outcome.seat], other: names[outcome.seat === 0 ? 1 : 0] })
        : h('wins', { name: names[outcome.seat] })}</strong>
      {times.map((time, index) => <p key={index} className="brick-challenge-time"><span>{names[index]}</span><strong>{time === null ? t('noClear') : `${(time / 1000).toFixed(3)} s`}</strong></p>)}
    </div> : expired ? <p role="status">{t('checking')}</p> : ownTime !== null ? <div className="challenge-card" role="status">
      <p><strong>{b('cleared', { time: (ownTime / 1000).toFixed(3) })}</strong></p>
      <p>{t('submitted')}</p>
    </div> : startsAt ? <Countdown startsAt={startsAt} offset={offset}>
      <BrickRallyBoard map={map} lives={view.lives} raceStart={Date.parse(startsAt) - offset}
        timeLimitMs={(view.timerSeconds ?? BRICK_MAX_SECONDS) * 1000} disabled={busy || confirm} onClear={result => onClear(result.brickTrace)} />
    </Countdown> : <>
      <p className="hint">{t('rules')}</p>
      <div className="brick-rally"><BrickMapPreview map={map} label={b('map')} /></div>
      {ready[seat] ? <p role="status">{t('waiting')}</p> : <button className="primary" type="button" disabled={busy} onClick={onReady}>{t('ready')}</button>}
    </>}
    {!outcome && !expired && (confirm ? <div className="actions">
      <button type="button" disabled={busy} onClick={onResign}>{h('yesGiveUp')}</button>
      <button type="button" className="ghost" onClick={() => setConfirm(false)}>{h('keepPlaying')}</button>
    </div> : <button type="button" className="ghost small-button" disabled={busy} onClick={() => setConfirm(true)}>{h('giveUp')}</button>)}
  </section>;
}
