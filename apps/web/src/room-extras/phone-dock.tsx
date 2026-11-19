import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { playerNeeded, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { ReactionTray } from './reactions.js';
import { ChallengeAlert } from './challenge-alert.js';
import { setSound, soundOn, unlockSound } from './celebrate.js';
import { chooseLanguage, LANGUAGES, useLanguage, type Language } from '../i18n/language.js';
import { translate } from '../i18n/texts.js';
import { PHONE_TEXTS } from '../room/phone.text.js';
import './room-extras.css';

type Sheet = 'menu' | 'scores' | 'players' | 'react' | 'games' | 'challenges' | 'language' | null;
// Side games and challenges load only when opened.
const SideGames = lazy(() => import('../side-games/side-games.js'));
const Challenges = lazy(() => import('../side-games/challenges.js'));

/** A bottom sheet over the phone screen; Escape or the close button closes it, and focus goes into it. */
function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  return <div className="sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div className="sheet-head"><h2 id="sheet-heading" ref={heading} tabIndex={-1}>{title}</h2><button type="button" className="ghost small-button" onClick={onClose}>✕<span className="visually-hidden"> Close</span></button></div>
      <div className="sheet-body">{children}</div>
    </div>
  </div>;
}

/**
 * The phone keeps the round on screen and everything else one tap away: the
 * scoreboard (when the host allows it), the players, reactions to the big
 * screen, and sound on or off. Nothing to scroll for.
 */
export function PhoneDock({ state, scores, canSeeScores, onChangeLook, onReact, onBreak, challengeTick }: {
  state: RoomSnapshot; scores: ReactNode; canSeeScores: boolean; onChangeLook: () => void; onReact: (reaction: number) => void; onBreak: (vote: boolean) => void; challengeTick: number;
}) {
  const t = useText(); const language = useLanguage(); const [sheet, setSheet] = useState<Sheet>(null); const [sound, setSoundState] = useState(soundOn);
  // Sound needs a first tap on phones; any tap in the dock (or an answer) prepares it.
  useEffect(() => { const prepare = () => unlockSound(); window.addEventListener('pointerdown', prepare, { once: true }); return () => window.removeEventListener('pointerdown', prepare); }, []);
  const close = () => setSheet(null);
  // Side games pause whenever the game needs this player: the sheet closes and a note says why.
  const needed = playerNeeded(state.view, state.selfPlayerId);
  const [pausedNote, setPausedNote] = useState(false);
  // A dot on Challenge when something changed (an invitation, a move) while the sheet was closed.
  const [seenTick, setSeenTick] = useState(challengeTick);
  useEffect(() => { if (sheet === 'challenges') setSeenTick(challengeTick); }, [sheet, challengeTick]);
  useEffect(() => {
    if (!needed || (sheet !== 'games' && sheet !== 'challenges')) return;
    setSheet(null); setPausedNote(true);
    const hide = setTimeout(() => setPausedNote(false), 4000); return () => clearTimeout(hide);
  }, [needed, sheet]);
  // Something changed in the challenges while they were closed: a dot on the Menu button.
  const news = state.settings.sideGames && challengeTick !== seenTick;
  return <>
    {pausedNote && <p className="side-paused-note" role="status">Round started: your side game is paused</p>}
    {/* Being challenged (or your move) shows at the top of the screen, no menu needed. */}
    {sheet !== 'challenges' && <ChallengeAlert state={state} tick={challengeTick} needed={needed} onOpen={() => setSheet('challenges')} />}
    {/* One button instead of a row of icons; the menu holds everything. */}
    <button type="button" className="dock-button" aria-haspopup="dialog" aria-expanded={sheet === 'menu'} onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}>
      <span aria-hidden="true">☰</span>Menu{news && <span className="dock-dot" aria-label="news" />}</button>
    {sheet === 'menu' && <BottomSheet title="Menu" onClose={close}><nav className="phone-dock" aria-label="More">
      {canSeeScores && <button type="button" onClick={() => setSheet('scores')}><span aria-hidden="true">🏆</span><small>{t('scores.title')}</small></button>}
      <button type="button" onClick={() => setSheet('players')}><span aria-hidden="true">👥</span><small>{t('players.title', { count: state.players.length })}</small></button>
      {state.settings.reactions && state.view.status !== 'FINISHED' && <button type="button" onClick={() => setSheet('react')}><span aria-hidden="true">😀</span><small>React</small></button>}
      {state.settings.breakVotes && state.view.status === 'RUNNING' && <button type="button" aria-pressed={state.break.voted} onClick={() => { onBreak(!state.break.voted); close(); }}>
        <span aria-hidden="true">{t('break.icon')}</span><small>{t('break.vote')} {state.break.votes}/{state.break.needed}</small></button>}
      {state.settings.sideGames && <button type="button" aria-disabled={needed} onClick={() => { if (!needed) setSheet('games'); }}>
        <span aria-hidden="true">🎰</span><small>{needed ? 'Games paused' : 'Games'}</small></button>}
      {state.settings.sideGames && <button type="button" aria-disabled={needed} onClick={() => { if (!needed) setSheet('challenges'); }}>
        <span aria-hidden="true">⚔️</span><small>Challenge{challengeTick !== seenTick && <span className="dock-dot" aria-label="news" />}</small></button>}
      <button type="button" aria-pressed={sound} onClick={() => { unlockSound(); setSound(!sound); setSoundState(!sound); }}><span aria-hidden="true">{sound ? '🔊' : '🔇'}</span><small>Sound</small></button>
      <button type="button" onClick={() => setSheet('language')}><span aria-hidden="true">🌐</span><small>{LANGUAGES[language]}</small></button>
    </nav></BottomSheet>}
    {/* The phone's language: the game's standard texts follow it; what the game's author wrote stays as written. */}
    {sheet === 'language' && <BottomSheet title={translate(PHONE_TEXTS, 'languageTitle')} onClose={close}><div className="language-choices" role="group" aria-label={translate(PHONE_TEXTS, 'language')}>
      {(Object.keys(LANGUAGES) as Language[]).map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => { chooseLanguage(code); close(); }}>{LANGUAGES[code]}</button>)}</div></BottomSheet>}
    {sheet === 'scores' && <BottomSheet title={t('scores.title')} onClose={close}>{scores}</BottomSheet>}
    {sheet === 'players' && <BottomSheet title={t('players.title', { count: state.players.length })} onClose={close}>
      <ul className="sheet-players">{state.players.map(player => <li key={player.id}><Avatar look={player.look} size={40} /><span>{player.displayName}{player.id === state.selfPlayerId ? ' (you)' : ''}</span>
        <span className={`dot ${player.connected ? 'on' : 'off'}`} aria-label={player.connected ? 'connected' : 'disconnected'} /></li>)}</ul>
      <button type="button" className="primary" onClick={() => { close(); onChangeLook(); }}>{t('players.changeLook')}</button>
    </BottomSheet>}
    {sheet === 'games' && <BottomSheet title="Side games" onClose={close}><Suspense fallback={<p role="status">Opening the games…</p>}><SideGames sessionId={state.view.sessionId} selfId={state.selfPlayerId} /></Suspense></BottomSheet>}
    {sheet === 'challenges' && <BottomSheet title="Challenges" onClose={close}><Suspense fallback={<p role="status">Opening challenges…</p>}><Challenges sessionId={state.view.sessionId} selfId={state.selfPlayerId} players={state.players} tick={challengeTick} /></Suspense></BottomSheet>}
    {sheet === 'react' && <BottomSheet title={t('react.open')} onClose={close}><ReactionTray onSend={onReact} choices={state.settings.reactionChoices} limit={state.settings.reactionLimit} /></BottomSheet>}
  </>;
}
