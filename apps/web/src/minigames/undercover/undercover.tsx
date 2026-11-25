import { useState } from 'react';
import { defaultLook, type RoomSnapshot, type UndercoverRole, type UndercoverView } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { Avatar } from '../../players/avatar.js';
import { FaIcon } from '../../presentation/icons.js';
import { useServerNow } from '../shared/clock.js';
import { UNDERCOVER_TEXTS } from './undercover.text.js';
import './undercover.css';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
export type UndercoverAct = (action: 'clued' | 'vote' | 'guess' | 'next', round: number, extra?: { playerId?: string; guess?: string }) => void;
const nameOf = (state: RoomSnapshot, id: string | null) => state.players.find(player => player.id === id)?.displayName ?? '…';
const lookOf = (state: RoomSnapshot, id: string) => state.players.find(player => player.id === id)?.look ?? defaultLook(id);

/**
 * Undercover / Mr. White on every screen. A phone has its own secret word (hidden until tapped, so a neighbour
 * cannot read along) and acts in turn: its clue, its vote, and Mr. White's guess. The host can always move on;
 * anyone can once the time is up, so a player who left never stalls the table.
 */
export function UndercoverTable({ state, stage, offset, disabled, onAct }: { state: RoomSnapshot; stage: Stage; offset: number; disabled: boolean; onAct: UndercoverAct }) {
  const u = useTexts(UNDERCOVER_TEXTS); const data = stage.minigame?.undercover;
  const view = data?.view;
  const ends = view ? view.phase === 'clues' ? view.turnEndsAt : view.phase === 'vote' ? view.voteEndsAt : view.phase === 'guess' ? view.guessEndsAt : null : null;
  const starts = stage.minigame?.startsAt ? Date.parse(stage.minigame.startsAt) : null;
  const now = useServerNow(offset, (ends !== null && ends !== undefined) || (starts !== null && starts > Date.now() + offset - 1000));
  if (!view) return null;
  // The countdown everyone starts together after (as in every minigame); the word can already be looked at.
  if (starts !== null && now < starts) return <div className="uc-table">{state.role === 'player' && data?.own !== undefined && <OwnWord word={data.own.word} />}
    <p className="mg-big" role="timer" aria-label={u('round', { round: 1 })}>{Math.ceil((starts - now) / 1000)}</p></div>;
  if (view.tooFew) return <p className="wait-note uc-few" role="status">{u('tooFew')}</p>;
  const me = state.role === 'player' ? state.selfPlayerId : null; const host = state.role === 'host';
  const outOf = (id: string) => view.out.find(entry => entry.playerId === id);
  const active = view.order.filter(id => !outOf(id)); const imOut = me !== null && Boolean(outOf(me));
  const left = ends ? Math.max(0, Math.ceil((Date.parse(ends) - now) / 1000)) : null;
  const timeUp = left === 0; const live = stage.status === 'ACTIVE' && state.view.status === 'RUNNING';
  const act: UndercoverAct = (action, round, extra) => { if (live) onAct(action, round, extra); };
  // Moving on: the host at any time, anyone else once the time is up.
  const next = (label: string) => live && view.phase !== 'done' && (host || (me && timeUp)) ? <button type="button" className="ghost uc-next" disabled={disabled} onClick={() => act('next', view.round)}>
    <FaIcon name="arrow-right" /> {host && !timeUp ? u('hostNext') : label}</button> : null;
  const role = (value: UndercoverRole) => u(value === 'civilian' ? 'civilian' : value === 'undercover' ? 'undercover' : 'white');
  const timer = left !== null && view.phase !== 'done' ? <span className="uc-time" role="timer"><FaIcon name="stopwatch" /> {u('timeLeft', { seconds: left })}</span> : null;

  return <div className={`uc-table phase-${view.phase}`}>
    {me && data?.own !== undefined && <OwnWord word={data.own.word} />}
    {view.last && <p className="uc-last" role="status">{view.last.outId ? u('out', { name: nameOf(state, view.last.outId), role: role(outOf(view.last.outId)?.role ?? 'civilian') }) : u('tie')}</p>}
    {imOut && view.phase !== 'done' && <p className="wait-note">{u('youAreOut')}</p>}
    <div className="uc-head"><strong>{u('round', { round: view.round })}</strong>{timer}</div>

    {view.phase === 'clues' && <>
      <p className="uc-ask">{view.speakerId === me ? <strong>{u('yourTurn')}</strong> : u('speaking', { name: nameOf(state, view.speakerId) })}</p>
      {view.speakerId === me && live && <button type="button" className="primary big uc-main" disabled={disabled} onClick={() => act('clued', view.round)}><FaIcon name="check" /> {u('clued')}</button>}
      {view.speakerId !== me && next(u('nextPlayer'))}
    </>}

    {view.phase === 'vote' && <>
      <p className="uc-ask"><strong>{u('voteTitle')}</strong> · {u('voted', { count: view.voters.length, total: active.length })}</p>
      {me && !imOut && data?.own?.vote && <p className="uc-note">{u('youVoted', { name: nameOf(state, data.own.vote) })}</p>}
      {next(u('countVotes'))}
    </>}

    {view.phase === 'guess' && (view.guesserId === me ? <GuessForm disabled={disabled || !live} onGuess={guess => act('guess', view.round, { guess })} />
      : <><p className="uc-ask">{u('guessing', { name: nameOf(state, view.guesserId) })}</p>{next(u('moveOn'))}</>)}

    {view.phase === 'done' && <p className="uc-winner" role="status">{u(view.winner === 'civilians' ? 'winCivilians' : view.winner === 'white' ? 'winWhite' : 'winImpostors')}</p>}

    {/* The table: everyone in speaking order. In a vote, players still in tap someone else; out players show their role. */}
    <ol className="uc-players" aria-label={u('inGame')}>{view.order.map(id => {
      const gone = outOf(id); const canVote = view.phase === 'vote' && live && me !== null && !imOut && !gone && id !== me;
      const picked = data?.own?.vote === id; const voted = view.voters.includes(id);
      const content = <><Avatar look={lookOf(state, id)} size={36} /><span className="uc-name">{nameOf(state, id)}{id === me ? ' ✦' : ''}</span>
        {view.speakerId === id && <span className="uc-badge speaking" aria-hidden="true">🗣</span>}
        {view.phase === 'vote' && voted && <span className="uc-badge" title={u('voted', { count: 1, total: 1 })} aria-hidden="true">✓</span>}
        {gone && <span className="uc-role">{role(gone.role)}</span>}</>;
      return <li key={id} className={`${gone ? 'gone' : ''}${view.speakerId === id ? ' speaking' : ''}`}>
        {canVote ? <button type="button" className="uc-player" aria-pressed={picked} disabled={disabled} onClick={() => act('vote', view.round, { playerId: id })}>{content}</button>
          : <span className="uc-player">{content}</span>}</li>;
    })}</ol>
    {view.phase === 'vote' && me && !imOut && <p className="hint">{u('voteHint')}</p>}
  </div>;
}

/** This phone's own word, hidden until tapped so that nobody reads along. */
function OwnWord({ word }: { word: string | null }) {
  const u = useTexts(UNDERCOVER_TEXTS); const [shown, setShown] = useState(false);
  return <div className="uc-word" role="group" aria-label={u('yourWord')}>
    {shown ? <><p className="uc-word-text">{word === null ? <><strong>{u('mrWhite')}</strong><small>{u('mrWhiteHint')}</small></> : <strong>{word}</strong>}</p>
      <button type="button" className="ghost" onClick={() => setShown(false)}><FaIcon name="lock" /> {u('hideWord')}</button></>
      : <button type="button" className="uc-reveal" onClick={() => setShown(true)}>{u('showWord')}</button>}
  </div>;
}

function GuessForm({ disabled, onGuess }: { disabled: boolean; onGuess: (guess: string) => void }) {
  const u = useTexts(UNDERCOVER_TEXTS); const [guess, setGuess] = useState('');
  return <form className="uc-guess" onSubmit={event => { event.preventDefault(); if (guess.trim()) onGuess(guess.trim()); }}>
    <p className="uc-ask"><strong>{u('guessTitle')}</strong></p>
    <label>{u('guessLabel')}<input value={guess} maxLength={60} autoComplete="off" onChange={event => setGuess(event.target.value)} /></label>
    <button type="submit" className="primary" disabled={disabled || !guess.trim()}>{u('send')}</button>
  </form>;
}

/** The words and everyone's role, for the results after the reveal. */
export function UndercoverReveal({ state, reveal }: { state: RoomSnapshot; reveal: { words: [string, string]; roles: { playerId: string; role: UndercoverRole }[]; winner: UndercoverView['winner']; guess?: string | undefined } }) {
  const u = useTexts(UNDERCOVER_TEXTS);
  return <div className="uc-reveal-box">
    <p className="uc-winner">{reveal.winner ? u(reveal.winner === 'civilians' ? 'winCivilians' : reveal.winner === 'white' ? 'winWhite' : 'winImpostors') : u('tooFew')}</p>
    <p>{u('words', { civilian: reveal.words[0], undercover: reveal.words[1] })}</p>
    {reveal.guess && <p>{u('guessed', { guess: reveal.guess })}</p>}
    <ul className="uc-roles">{reveal.roles.filter(entry => entry.role !== 'civilian').map(entry =>
      <li key={entry.playerId}><Avatar look={lookOf(state, entry.playerId)} size={28} /><span>{nameOf(state, entry.playerId)}</span><strong>{u(entry.role === 'white' ? 'white' : 'undercover')}</strong></li>)}</ul>
  </div>;
}
