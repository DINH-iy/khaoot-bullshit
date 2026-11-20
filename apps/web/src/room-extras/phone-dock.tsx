import { useEffect, useState, type ReactNode } from 'react';
import { playerNeeded, TEXT_DEFAULTS, type PhoneMenuAction, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { PhoneFeedbackPanel } from './phone-feedback-panel.js';
import { PHONE_FEEDBACK_TEXTS } from './phone-feedback.text.js';
import { rumbleAvailable } from './phone-feedback.js';
import { RoomChat } from './chat.js';
import { CHAT_TEXTS } from './chat.text.js';
import { ReactionTray } from './reactions.js';
import { ChallengeAlert } from './challenge-alert.js';
import { setSound, soundOn, unlockSound } from './celebrate.js';
import { chooseLanguage, LANGUAGES, useLanguage, type Language } from '../i18n/language.js';
import { translate, useTexts } from '../i18n/texts.js';
import { PHONE_TEXTS } from '../room/phone.text.js';
import { ROUND_CONTROL_TEXTS } from '../room/round-control.text.js';
import { roomApi } from '../room/api.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
import { Icon } from '../presentation/line-icons.js';
import { PhoneMenuIcon } from './phone-menu-icon.js';
import { LeaveRoom } from './leave-room.js';
import { BottomSheet } from './bottom-sheet.js';
import { SideGamesSheet, type SideGame } from '../side-games/side-games.js';
import { Challenges } from '../side-games/challenges.js';
import { useSideWallet } from '../side-games/use-side-wallet.js';
import { useChallenges } from '../side-games/use-challenges.js';
import './room-extras.css';

const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);

type Sheet = 'menu' | 'scores' | 'players' | 'react' | 'chat' | 'settings' | 'games' | 'challenges' | 'language' | null;
/**
 * The phone keeps the round on screen and everything else one tap away: the
 * scoreboard (when the host allows it), the players, reactions to the big
 * screen, and sound on or off. Nothing to scroll for.
 */
export function PhoneDock({ state, scores, canSeeScores, onChangeLook, onReact, onBreak, challengeTick }: {
  state: RoomSnapshot; scores: ReactNode; canSeeScores: boolean; onChangeLook: () => void; onReact: (reaction: number) => void; onBreak: (vote: boolean) => void; challengeTick: number;
}) {
  const t = useText(); const chat = useTexts(CHAT_TEXTS); const preferences = useTexts(PHONE_FEEDBACK_TEXTS); const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const [birthdayError, setBirthdayError] = useState(false); const [birthdayBusy, setBirthdayBusy] = useState(false);
  const language = useLanguage(); const [sheet, setSheet] = useState<Sheet>(null); const [sound, setSoundState] = useState(soundOn);
  // Sound needs a first tap on phones; any tap in the dock (or an answer) prepares it.
  useEffect(() => { const prepare = () => unlockSound(); window.addEventListener('pointerdown', prepare, { once: true }); return () => window.removeEventListener('pointerdown', prepare); }, []);
  const [sideGame, setSideGame] = useState<SideGame | null>(null);
  const lobby = state.view.status === 'LOBBY';
  const breakMark = t('break.icon');
  const icon = (action: PhoneMenuAction) => <PhoneMenuIcon action={action} icons={state.view.presentation.phoneMenuIcons}
    muted={!sound} breakMark={action === 'break' && breakMark !== TEXT_DEFAULTS['break.icon'] ? breakMark : undefined} />;
  // Side games pause whenever the game needs this player: the sheet closes and a note says why.
  const needed = playerNeeded(state.view, state.selfPlayerId);
  const { sessionId } = state.view;
  const { sideGames, chips } = state.settings;
  const wallet = useSideWallet(sessionId, state.selfPlayerId, sideGames && !needed && (sheet === 'menu' || sheet === 'games'), chips);
  const challenges = useChallenges(sessionId, state.selfPlayerId, sideGames, chips, challengeTick);
  const close = () => {
    if (sheet === 'games') void challenges.refresh();
    setSheet(null);
  };
  useEffect(() => {
    if (!sideGames && (sheet === 'games' || sheet === 'challenges')) setSheet(null);
  }, [sideGames, sheet]);
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
    {state.birthdayVote?.ready && <p className="side-paused-note" role="status">{rounds('birthdayReady')}</p>}
    {pausedNote && <p className="side-paused-note" role="status">{x('sidePaused')}</p>}
    {/* Being challenged (or your move) shows at the top of the screen, no menu needed. */}
    {sideGames && <ChallengeAlert state={state} challenges={sheet === 'challenges' ? [] : challenges.data?.challenges ?? []} needed={needed} onOpen={() => setSheet('challenges')} />}
    {/* One button instead of a row of icons; the menu holds everything. */}
    <div className="phone-dock-buttons">
      {state.settings.reactions && <button type="button" className="dock-button dock-react" aria-haspopup="dialog"
        aria-expanded={sheet === 'react'} aria-label={t('react.open')} onClick={() => setSheet(sheet === 'react' ? null : 'react')}>
        {icon('react')}
      </button>}
      <button type="button" className="dock-button" aria-haspopup="dialog" aria-expanded={sheet === 'menu'} onClick={() => setSheet(sheet === 'menu' ? null : 'menu')}>
        <Icon name="menu" size={20} />{x('menu')}{news && <span className="dock-dot" aria-label={x('news')} />}
      </button>
    </div>
    {sheet === 'menu' && <BottomSheet key="menu" title={x('menu')} onClose={close} resizable><nav className="phone-dock" aria-label={x('more')}>
      {canSeeScores && <button type="button" onClick={() => setSheet('scores')}>{icon('scores')}<small>{t('scores.title')}</small></button>}
      <button type="button" onClick={() => setSheet('players')}>{icon('players')}<small>{t('players.title', { count: state.players.length })}</small></button>
      {state.settings.chat && <button type="button" onClick={() => setSheet('chat')}>{icon('chat')}<small>{chat('title')}</small></button>}
      {state.settings.reactions && <button type="button" onClick={() => setSheet('react')}>{icon('react')}<small>{x('react')}</small></button>}
      {state.settings.breakVotes && state.view.status === 'RUNNING' && <button type="button" aria-pressed={state.break.voted} onClick={() => { onBreak(!state.break.voted); close(); }}>
        {icon('break')}<small>{t('break.vote')} {state.break.votes}/{state.break.needed}</small></button>}
      {state.settings.sideGames && <button type="button" aria-disabled={needed} onClick={() => { if (!needed) setSheet('games'); }}>
        {icon('games')}<small>{x(needed ? 'gamesPaused' : 'games')}</small></button>}
      {state.settings.sideGames && <button type="button" aria-disabled={needed} onClick={() => { if (!needed) setSheet('challenges'); }}>
        {icon('challenge')}<small>{x('challenge')}{challengeTick !== seenTick && <span className="dock-dot" aria-label={x('news')} />}</small></button>}
      {state.birthdayVote && !state.birthdayVote.ready && <button type="button" disabled={birthdayBusy} aria-pressed={state.birthdayVote.voted} onClick={() => {
        setBirthdayBusy(true); setBirthdayError(false);
        void roomApi(`/api/rooms/${state.view.sessionId}/birthday-vote`, { vote: !state.birthdayVote?.voted })
          .catch(() => setBirthdayError(true)).finally(() => setBirthdayBusy(false));
      }}>{icon('birthday')}<small>{rounds(state.birthdayVote.voted ? 'unsing' : 'sing')}</small></button>}
      {birthdayError && <p role="alert">{rounds('birthdayFailed')}</p>}
      <div className="phone-menu-footer">
        <button type="button" className="menu-settings" onClick={() => setSheet('settings')}>{icon('effects')}<small>{x('phoneSettings')}</small></button>
        <button type="button" className="menu-language" onClick={() => setSheet('language')}>{icon('language')}<small>{LANGUAGES[language]}</small></button>
        {!state.arcade && <LeaveRoom>{icon('leave')}<small>{x('leaveRoom')}</small></LeaveRoom>}
      </div>
    </nav></BottomSheet>}
    {/* The phone's language: the game's standard texts follow it; what the game's author wrote stays as written. */}
    {sheet === 'language' && <BottomSheet title={translate(PHONE_TEXTS, 'languageTitle')} onClose={close}><div className="language-choices" role="group" aria-label={translate(PHONE_TEXTS, 'language')}>
      {(Object.keys(LANGUAGES) as Language[]).map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => { chooseLanguage(code); close(); }}>{LANGUAGES[code]}</button>)}</div></BottomSheet>}
    {sheet === 'settings' && <BottomSheet title={x('phoneSettings')} onClose={close}>
      <button type="button" className="phone-sound-toggle" aria-pressed={sound} onClick={() => { unlockSound(); setSound(!sound); setSoundState(!sound); }}>{icon('sound')}{x('sound')}</button>
      {(lobby || rumbleAvailable()) && <section className="phone-settings-effects"><h3>{preferences('title')}</h3>
        <PhoneFeedbackPanel canCustomize={lobby && state.view.phoneEffects === true} microphone={lobby} />
      </section>}
    </BottomSheet>}
    {sheet === 'scores' && <BottomSheet title={t('scores.title')} onClose={close}>{scores}</BottomSheet>}
    {sheet === 'players' && <BottomSheet title={t('players.title', { count: state.players.length })} onClose={close}>
      <ul className="sheet-players">{state.players.map(player => <li key={player.id}><Avatar look={player.look} size={40} /><span>{player.displayName}{player.id === state.selfPlayerId ? x('you') : ''}</span>
        <span className={`dot ${player.connected ? 'on' : 'off'}`} aria-label={x(player.connected ? 'connected' : 'disconnected')} /></li>)}</ul>
      <button type="button" className="primary" onClick={() => { close(); onChangeLook(); }}>{t('players.changeLook')}</button>
    </BottomSheet>}
    {sheet === 'games' && sideGames && <SideGamesSheet title={x('sideGames')} onClose={close} sessionId={sessionId} selfId={state.selfPlayerId}
      selected={sideGame} onSelect={setSideGame} withChips={chips} icons={state.view.presentation.phoneMenuIcons} state={wallet} />}
    {sheet === 'challenges' && sideGames && <BottomSheet key="challenges" title={x('challenges')} onClose={close} resizable>
      <Challenges sessionId={sessionId} selfId={state.selfPlayerId} players={state.players} withChips={chips} state={challenges} />
    </BottomSheet>}
    {sheet === 'chat' && state.settings.chat && <BottomSheet title={chat('title')} onClose={close}><RoomChat state={state} /></BottomSheet>}
    {sheet === 'react' && <BottomSheet title={t('react.open')} onClose={close}><ReactionTray onSend={onReact} choices={state.settings.reactionChoices} limit={state.settings.reactionLimit} /></BottomSheet>}
  </>;
}
