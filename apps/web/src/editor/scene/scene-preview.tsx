import { useEffect, useId, useRef, useState } from 'react';
import { answerMark, DEFAULT_MEDIA_LAYOUT, MediaLayoutSchema, SceneMediaSchema, YouTubeClipSchema, mergePresentationTexts, sceneMediaUrl, type SceneTranslations } from '@party/contracts';
import { useLanguage } from '../../i18n/language.js';
import { useTexts } from '../../i18n/texts.js';
import { buildLook, themeClass, themeStyle } from '../../presentation/look.js';
import { Mark } from '../../presentation/mark-icons.js';
import { SceneComposition } from '../../presentation/scene-composition.js';
import { StageMedia, StageYouTube } from '../../room/stage-media.js';
import { formatRemaining } from '../../room/stage-timer.js';
import { answerFit } from '../../room/answer-fit.js';
import { layerOf } from '../look/layer.js';
import { optionsOf, quizKind, uniqueKey, type Definition, type Node, type Stage } from '../model.js';
import { FIELDS_TEXTS } from './fields.text.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { SCENE_PRESENTATION_TEXTS } from './scene-presentation.text.js';

type Device = 'sharedScreen' | 'phone';
interface PreviewProps { definition: Definition; node: Node; index: number }
interface CanvasControls {
  readOnly: boolean;
  edit: (change: (stage: Stage) => Stage, field: string) => void;
  editMedia: () => void;
}

export function ScenePreview({ definition, node, index, device, canvas }: PreviewProps & { device: Device; canvas?: CanvasControls }) {
  const t = useTexts(FIELDS_TEXTS);
  const fields = useTexts(INSPECTOR_TEXTS);
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const radioGroup = useId();
  const language = useLanguage();
  const stage = node.stages[index]!;
  const gameLook = layerOf(definition, { kind: 'game' });
  const sceneLook = layerOf(definition, { kind: 'scene', nodeKey: node.key, stageIndex: index });
  const look = buildLook({ ...mergePresentationTexts(gameLook, sceneLook), themes: [gameLook.theme, sceneLook.theme] }, language);
  const { theme } = look;
  const translations = canvas ? undefined : (stage['translations'] as SceneTranslations | undefined)?.[language];
  const prompt = translations?.prompt ?? stage.prompt ?? '';
  const title = translations?.title ?? String(stage.title ?? '');
  const label = stage.kind === 'info' ? title : prompt;
  const promptLabel = fields(stage.kind === 'info' ? 'lInfo' : 'lQuestion');
  const timer = typeof stage.durationMs === 'number' ? look.text('timer.left', { time: formatRemaining(stage.durationMs) }) : null;
  const input = stage['input'] as { kind?: string; options?: { key: string; label: string }[]; items?: { key: string; label: string }[]; layout?: string } | undefined;
  const options = (stage.kind === 'route' ? optionsOf(node) : input?.options ?? input?.items ?? []).map(option => ({
    ...option, label: Object.hasOwn(translations?.labels ?? {}, option.key) ? translations!.labels![option.key]! : option.label,
  }));
  const media = SceneMediaSchema.safeParse(stage['media']).data;
  const clip = YouTubeClipSchema.safeParse(stage['youtube']).data;
  const layout = MediaLayoutSchema.safeParse(stage['mediaLayout']).data ?? DEFAULT_MEDIA_LAYOUT;
  const contentMedia = (role: 'display' | 'player') => clip
    ? <StageYouTube key={clip.videoId} clip={clip} label={label} role={role} displayConnected preview />
    : media && <StageMedia key={media.id} media={{ ...media, url: sceneMediaUrl(media.id) }} label={label} role={role} displayConnected preview />;
  const classes = themeClass(theme);
  const style = themeStyle(theme);
  const phoneHint = t(stage.kind === 'info' || stage.kind === 'scoreboard' ? 'pWatch'
    : stage.kind === 'challenge' ? 'pHost' : stage.kind === 'minigame' ? 'pMinigame'
    : stage.kind === 'vote' ? 'pVote' : input?.kind === 'text' ? 'pType' : input?.kind === 'media' ? 'pUpload' : input?.kind === 'drawing' ? 'pDraw' : input?.kind === 'order' ? 'pOrder' : 'pChoose');
  const ordered = input?.kind === 'order';
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string } | undefined;
  const choices = input?.kind === 'choice' ? input.options : undefined;
  const mediaButton = canvas && ['collect', 'challenge', 'info'].includes(stage.kind)
    ? <button type="button" className="canvas-media-button" disabled={canvas.readOnly} onClick={canvas.editMedia}>{labels(media || clip ? 'editMedia' : 'addMedia')}</button> : null;
  const sharedMedia = contentMedia('display');
  return <div className={canvas ? 'preview scene-canvas' : 'preview'}>
    {device !== 'phone' && <figure className="tv"><figcaption>{t('sharedScreen')}</figcaption>
      <div className={`tv-screen room room-display ${classes}`} style={style}>
        <SceneComposition layout={layout} media={mediaButton ? <div className={`canvas-media${sharedMedia ? '' : ' empty'}`}>{sharedMedia}{mediaButton}</div> : sharedMedia}>
          {stage.kind === 'info' && (canvas ? <input className="tv-banner canvas-title" aria-label={fields('title')} placeholder={fields('title')} value={title} maxLength={120} readOnly={canvas.readOnly}
            onChange={event => canvas.edit(current => ({ ...current, title: event.target.value }), 'title')} /> : <p className="tv-banner">{title}</p>)}
          {canvas ? <div className="canvas-prompt-box" data-text={prompt || promptLabel}>
            <textarea className="tv-prompt canvas-prompt" rows={1} aria-label={promptLabel} placeholder={promptLabel}
              value={prompt} readOnly={canvas.readOnly} maxLength={2000} onChange={event => canvas.edit(current => ({ ...current, prompt: event.target.value }), 'prompt')} />
          </div> : <p className="tv-prompt">{prompt}</p>}
        </SceneComposition>
        {timer && <p className="timer">{timer}</p>}
        {options.length > 0 && <ul className={`${canvas ? 'tv-options' : 'options-board'}${ordered || (canvas && input?.layout === 'list') ? ' order' : ''}`}
          style={canvas ? undefined : answerFit(options.map(option => option.label))}>{options.map((option, position) => {
          const mark = ordered ? String(position + 1) : answerMark(theme, position, options.length, stage.kind === 'route');
          return <li key={option.key} className={canvas && choices ? 'canvas-answer' : undefined}
            style={{ '--option-accent': theme.colors.answers[position % theme.colors.answers.length] } as React.CSSProperties}>
            {mark && <span className={canvas ? undefined : 'answer-mark'} aria-hidden="true"><Mark text={mark} /></span>}
            {canvas && choices ? <>
              <input type="text" aria-label={fields('answerOption', { number: position + 1 })} maxLength={240} readOnly={canvas.readOnly} value={option.label}
                onChange={event => canvas.edit(current => ({ ...current, input: { ...input, options: choices.map(entry => entry.key === option.key ? { ...entry, label: event.target.value } : entry) } }), `option-${option.key}`)} />
              {scoring?.kind === 'correct-choice' && <input type="radio" name={radioGroup} aria-label={fields('isCorrect', { label: option.label })} checked={scoring.correctChoiceKey === option.key}
                disabled={canvas.readOnly} onChange={() => canvas.edit(current => ({ ...current, scoring: { ...scoring, correctChoiceKey: option.key } }), 'correct')} />}
            </> : option.label}
          </li>;
        })}</ul>}
        {canvas && choices && input && quizKind(input) !== 'true-false' && choices.length < 12 && <button className="canvas-add-answer" type="button" disabled={canvas.readOnly}
          onClick={() => canvas.edit(current => ({ ...current, input: { ...input, options: [...choices, { key: uniqueKey('answer', choices.map(option => option.key)), label: fields('newAnswer') }] } }), 'answers')}>{fields('addAnswer')}</button>}
        {stage.kind === 'scoreboard' && <ol className="tv-scores"><li>{t('playerOne')} <b>30</b></li><li>{t('playerTwo')} <b>20</b></li><li>{t('playerThree')} <b>10</b></li></ol>}
      </div></figure>}
    {device !== 'sharedScreen' && <figure className="phone"><figcaption>{t('phone')}</figcaption>
      <div className={`phone-screen room room-player ${classes}`} style={style}>
        <SceneComposition layout={layout} media={contentMedia('player')}>
          <p className="phone-prompt">{label}</p>
          {stage.kind === 'info' && <p className="phone-hint">{prompt}</p>}
        </SceneComposition>
        {timer && <p className="timer">{timer}</p>}
        {['collect', 'vote', 'route'].includes(stage.kind) && options.length > 0 && !ordered
          ? (input?.layout === 'tiles' || stage.kind === 'route') ? <fieldset className="tiles" style={answerFit(options.map(option => option.label))}>
            <legend>{look.text('answer.legend')}</legend>
            {options.map((option, index) => {
              const mark = answerMark(theme, index, options.length, stage.kind === 'route');
              return <div key={option.key} className="tile">{mark !== null && <span className="answer-mark tile-mark" aria-hidden="true"><Mark text={mark} /></span>}{option.label}</div>;
            })}
          </fieldset> : <div className="phone-list">{options.map(option => <span key={option.key}>{option.label}</span>)}</div>
          : <p className="phone-hint">{phoneHint}</p>}
      </div></figure>}
  </div>;
}

export function ScenePreviewDialog({ onClose, initialDevice, ...preview }: PreviewProps & { initialDevice: Device; onClose: () => void }) {
  const t = useTexts(FIELDS_TEXTS);
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const [device, setDevice] = useState(initialDevice);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={dialog} className={`scene-preview-dialog${device === 'phone' ? ' phone-preview-dialog' : ''}`} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="scene-preview-window">
      <header><h2 id={title}>{t('preview')}</h2>
        <button type="button" className="small-button" autoFocus onClick={onClose}>{labels('close')}</button>
      </header>
      <div className="segmented" role="group" aria-label={labels('devices')}>
        {(['sharedScreen', 'phone'] as const).map(choice => <button key={choice} type="button" aria-pressed={device === choice} onClick={() => setDevice(choice)}>{t(choice)}</button>)}
      </div>
      <ScenePreview {...preview} device={device} />
    </div>
  </dialog>;
}

