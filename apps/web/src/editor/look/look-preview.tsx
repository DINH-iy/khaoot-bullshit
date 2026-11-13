import { useRef, useState, type CSSProperties } from 'react';
import type { Moment } from '@party/contracts';
import { play, useLook } from '../../presentation/look.js';
import type { Definition, Stage } from '../model.js';
import type { Scope } from './layer.js';

type Moment_ = 'join' | 'lobby' | 'question' | 'saved' | 'results' | 'scores';
const MOMENTS_SHOWN: Record<Moment_, string> = { join: 'Joining', lobby: 'Lobby', question: 'Question', saved: 'Answer saved', results: 'Results', scores: 'Scoreboard' };
const PLAYS: Record<Moment_, { moment: Moment; list: boolean }> = { join: { moment: 'sceneEnter', list: false }, lobby: { moment: 'lobbyJoin', list: false }, question: { moment: 'answersEnter', list: true }, saved: { moment: 'answerSaved', list: false }, results: { moment: 'reveal', list: true }, scores: { moment: 'scoreboard', list: true } };

/** A question to show: the scene being styled, or else the first question in the game, or else an example. */
function sampleStage(definition: Definition, scope: Scope): { prompt: string; options: string[] } {
  const stages: Stage[] = scope.kind === 'scene' ? [definition.nodes.find(node => node.key === scope.nodeKey)?.stages[scope.stageIndex]].filter((stage): stage is Stage => Boolean(stage)) : [];
  const candidates = [...stages, ...definition.nodes.flatMap(node => node.stages)];
  for (const stage of candidates) {
    const input = stage['input'] as { options?: { label: string }[]; items?: { label: string }[] } | undefined;
    const options = (input?.options ?? input?.items ?? []).map(option => option.label).filter(Boolean);
    if (stage.prompt && options.length >= 2) return { prompt: stage.prompt, options: options.slice(0, 6) };
    if (stage === stages[0] && stage.prompt) return { prompt: stage.prompt, options: ['Answer one', 'Answer two', 'Answer three', 'Answer four'] };
  }
  return { prompt: 'Which planet is the biggest?', options: ['Jupiter', 'Mars', 'Venus', 'Saturn'] };
}

/** The shared screen and a phone, drawn with the real room styles and the chosen look. */
export function LookPreview({ definition, scope, style, className }: { definition: Definition; scope: Scope; style: CSSProperties; className: string }) {
  const look = useLook(); const t = look.text; const [shown, setShown] = useState<Moment_>('question');
  const tvRef = useRef<HTMLDivElement>(null); const phoneRef = useRef<HTMLDivElement>(null);
  const sample = sampleStage(definition, scope);
  const replay = (next: Moment_) => {
    setShown(next); const { moment, list } = PLAYS[next];
    requestAnimationFrame(() => { play(tvRef.current, look.animation(moment), { staggerChildren: list }); play(phoneRef.current, look.animation(next === 'question' ? 'answersEnter' : moment), { staggerChildren: list }); });
  };
  const players = ['Sam', 'Noor', 'Alex', 'Kim'];
  return <div className="look-preview">
    <div className="segmented" role="group" aria-label="Show this moment">{(Object.keys(MOMENTS_SHOWN) as Moment_[]).map(key => <button key={key} aria-pressed={shown === key} onClick={() => replay(key)}>{MOMENTS_SHOWN[key]}</button>)}
      <button className="small-button" onClick={() => replay(shown)}>▶ Play again</button></div>
    <div className="look-devices">
      <figure className="look-tv"><figcaption>Shared screen</figcaption>
        <div className={`room room-display room-preview ${className}`} style={style}><div ref={tvRef} className="preview-body">
          {shown === 'join' || shown === 'lobby' ? <section className="lobby"><h2>{t('lobby.screenTitle')}</h2><p>{t('lobby.screenGo', { host: 'party.example' })}</p><p className="big-code">ABC123</p>
            {shown === 'lobby' && <ul className="players preview-players">{players.map(name => <li key={name}>{name}</li>)}</ul>}</section>
            : shown === 'scores' ? <section className="stage-card"><h2>{t('scores.title')}</h2><ol className="scoreboard plain-list">{players.map((name, index) => <li key={name}>{name} · {40 - index * 10}</li>)}</ol><p>{t('scores.note')}</p></section>
            : <section className="stage-card"><h2>{sample.prompt}</h2>
              {shown === 'question' || shown === 'saved' ? <><p className="timer">{t('timer.left', { time: '0:15' })}</p>
                <ol className="options-board">{sample.options.map((option, index) => <li key={index}><span>{String.fromCharCode(65 + index)}</span>{option}</li>)}</ol>
                <p className="progress-line">{t('progress.answered', { count: shown === 'saved' ? 3 : 2, total: 4 })}</p></>
                : <><h3>{t('results.title')}</h3><p>{t('results.correct', { answer: sample.options[0]! })}</p><h4>{t('results.points')}</h4><ul className="plain-list">{players.slice(0, 2).map(name => <li key={name}>{name} · 10</li>)}</ul></>}
            </section>}
        </div></div></figure>
      <figure className="look-phone"><figcaption>Phone</figcaption>
        <div className={`room room-player room-preview ${className}`} style={style}><div ref={phoneRef} className="preview-body">
          {shown === 'join' ? <section className="join-card"><p className="brand">party<span>.</span></p><h2>{t('join.title')}</h2><p className="room-game">{definition.title}</p>
            <label>{t('join.code')}<input className="code-input" readOnly value="ABC123" /></label><label>{t('join.name')}<input readOnly value="Sam" /></label><button className="primary" type="button">{t('join.button')}</button></section>
            : shown === 'lobby' ? <section className="lobby"><h2>{t('lobby.playerTitle')}</h2><p>{t('lobby.playerText')}</p></section>
            : <section className="stage-card"><h2>{sample.prompt}</h2>
              {shown === 'question' ? <><p className="timer">{t('timer.left', { time: '0:15' })}</p><fieldset className="tiles"><legend>{t('answer.legend')}</legend>
                {sample.options.map((option, index) => <label key={index} className="tile"><span className="tile-mark" aria-hidden="true">{String.fromCharCode(65 + index)}</span>{option}</label>)}</fieldset>
                <button className="primary" type="button">{t('answer.submit')}</button></>
                : shown === 'saved' ? <p className="answer-in">{t('answer.saved')}</p>
                : shown === 'results' ? <><h3>{t('results.title')}</h3><p>{t('results.earned', { points: 10 })}</p></>
                : <><h3>{t('scores.title')}</h3><p>{t('wait.screen')}</p></>}
            </section>}
        </div></div></figure>
    </div>
    <p className="hint">This is how the room will look. Animations play when you pick a moment. Pictures, sounds and the show host come later.</p>
  </div>;
}
