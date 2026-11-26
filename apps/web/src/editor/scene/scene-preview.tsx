import { BrickMapPreview } from '../../minigames/brick-rally/board.js';
import { GraphChart } from '../../minigames/draw-the-graph/graph-chart.js';
import { isDefaultGraphQuestion } from '../../minigames/draw-the-graph/graph-question.js';
import { GRAPH_TEXTS } from '../../minigames/draw-the-graph/graph.text.js';
import { DotGuessForm } from '../../minigames/count-the-dots/count-dots.js';
import { SpeedRunBoard } from '../../minigames/speed-run/speed-run.js';
import { useEffect, useId, useRef, useState } from 'react';
import { brickMap, BrickSettingsSchema, GraphSettingsSchema, SAMPLE_GRAPH, MINIGAMES, howToPlayKey, isMinigameKey, answerMark, DEFAULT_MEDIA_LAYOUT, MediaLayoutSchema, SceneMediaSchema, YouTubeClipSchema, mergePresentationTexts, sceneMediaUrl, type SceneTranslations } from '@party/contracts';
import { useLanguage } from '../../i18n/language.js';
import { translate, useTexts } from '../../i18n/texts.js';
import { DrawBoard } from '../../room/minigame-draw.js';
import { ClockFace } from '../../room/stage-timer.js';
import { PLAY_TEXTS } from '../../room/play.text.js';
import { buildLook, LookContext, themeClass, useThemeStyle } from '../../presentation/look.js';
import { GameSymbol } from '../../presentation/game-symbol.js';
import { gameDescription, gameName } from '../../presentation/catalog.text.js';
import { Mark } from '../../presentation/mark-icons.js';
import { SceneComposition } from '../../presentation/scene-composition.js';
import { StageMedia, StageYouTube } from '../../room/stage-media.js';
import { formatRemaining } from '../../room/stage-timer.js';
import { answerFit } from '../../room/answer-fit.js';
import { layerOf } from '../look/layer.js';
import { isDrawScene, optionsOf, quizKind, uniqueKey, type Definition, type Node, type Stage } from '../model.js';
import { FIELDS_TEXTS } from './fields.text.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { SCENE_PRESENTATION_TEXTS } from './scene-presentation.text.js';
import { MinigamePractice } from './minigame-practice.js';
import { ScenePractice } from './scene-practice.js';
import { PhoneFrame } from '../../ui/phone-devices.js';
import { PRACTICE_TEXTS } from './scene-practice.text.js';

// `both`: the shared screen and the phone side by side (Look & feel's “This scene”).
type Device = 'sharedScreen' | 'phone' | 'both';
interface PreviewProps { definition: Definition; node: Node; index: number }
interface CanvasControls {
  readOnly: boolean;
  edit: (change: (stage: Stage) => Stage, field: string) => void;
  editMedia: () => void;
}

export function ScenePreview({ definition, node, index, device, canvas, interactive, compactIntro, phonePicker = true }: PreviewProps & {
  device: Device; canvas?: CanvasControls | undefined; interactive?: boolean; compactIntro?: boolean;
  /** false: the phone model is chosen somewhere else on the page (the Scene editor's toolbar). */
  phonePicker?: boolean;
}) {
  const t = useTexts(FIELDS_TEXTS);
  const fields = useTexts(INSPECTOR_TEXTS);
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
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
  const timer = typeof stage.durationMs === 'number' && !(stage.kind === 'minigame' && stage['game'] === 'stop-clock') ? look.text('timer.left', { time: formatRemaining(stage.durationMs) }) : null;
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
  const style = useThemeStyle(theme);
  const phoneHint = t(stage.kind === 'info' || stage.kind === 'scoreboard' ? 'pWatch'
    : stage.kind === 'challenge' ? 'pHost' : stage.kind === 'minigame' ? 'pMinigame'
    : stage.kind === 'vote' ? 'pVote' : input?.kind === 'text' ? 'pType' : input?.kind === 'media' ? 'pUpload' : input?.kind === 'drawing' ? 'pDraw' : input?.kind === 'order' ? 'pOrder' : 'pChoose');
  const ordered = input?.kind === 'order';
  // A minigame draw shows its cards, as in the room.
  const draw = isDrawScene(stage); const drawHint = translate(PLAY_TEXTS, 'drawWho');
  const scoring = stage['scoring'] as { kind?: string; correctChoiceKey?: string } | undefined;
  const choices = input?.kind === 'choice' ? input.options : undefined;
  const mediaButton = canvas && ['collect', 'challenge', 'info'].includes(stage.kind)
    ? <button type="button" className="canvas-media-button" disabled={canvas.readOnly} onClick={canvas.editMedia}>{labels(media || clip ? 'editMedia' : 'addMedia')}</button> : null;
  const sharedMedia = contentMedia('display');
  const game = stage['game'];
  const minigame = stage.kind === 'minigame' && typeof game === 'string' && isMinigameKey(game) ? game : undefined;
  const compactPhone = interactive && device === 'phone' && Boolean(minigame);
  const phoneLabel = compactPhone && minigame === 'draw-the-graph' && isDefaultGraphQuestion(label)
    ? graphText(GraphSettingsSchema.safeParse(stage['settings']).data?.graph ? 'trendQuestion' : 'sampleQuestion')
    : compactPhone && !label && minigame ? gameName(minigame) : label;
  const minigameIntro = minigame ? <MinigamePreview stage={stage} game={minigame} text={look.text} compact={Boolean(compactIntro)} /> : null;
  const practice = interactive ? <LookContext.Provider value={look}>
    {minigame === 'count-the-dots' && device === 'phone' ? <DotGuessForm disabled onResult={() => {}} />
      : minigame ? <MinigamePractice stage={stage} game={minigame} shared={device === 'sharedScreen'} intro={compactPhone &&
        (minigame === 'cut-the-line' || (minigame === 'draw-the-graph' && !compactIntro)) ? null : minigameIntro} /> : <ScenePractice definition={definition} stage={stage} options={options} />}
  </LookContext.Provider> : null;
  const minigameCard = minigame && !interactive ? <>
    {minigameIntro}
  </> : null;
  return <div className={canvas ? 'preview scene-canvas' : 'preview'}>
    {device !== 'phone' && <figure className="tv"><figcaption>{t('sharedScreen')}</figcaption>
      <div className={`tv-screen room room-display ${classes}`} style={style}>
        <SceneComposition layout={layout} media={mediaButton ? <div className={`canvas-media${sharedMedia ? '' : ' empty'}`}>{sharedMedia}{mediaButton}</div> : sharedMedia}>
          {stage.kind === 'info' && (canvas ? <input className="tv-banner canvas-title" aria-label={fields('title')} placeholder={fields('title')} value={title} maxLength={120} readOnly={canvas.readOnly}
            onChange={event => canvas.edit(current => ({ ...current, title: event.target.value }), 'title')} /> : <p className="tv-banner">{title}</p>)}
          {canvas ? <CanvasPrompt value={prompt} label={promptLabel} readOnly={canvas.readOnly}
            onChange={value => canvas.edit(current => ({ ...current, prompt: value }), 'prompt')} /> : <p className="tv-prompt">{prompt}</p>}
        </SceneComposition>
        {!interactive && timer && <p className="timer">{theme.timerStyle === 'clock' && typeof stage.durationMs === 'number' ? <ClockFace left={stage.durationMs} total={stage.durationMs} ending={false} up={false} clockwise={theme.timerTurn !== 'counterclockwise'} /> : timer}</p>}
        {minigameCard}
        {practice}
        {!interactive && draw && <DrawBoard options={options} drawn={null} at={null} seed="" waiting={drawHint} />}
        {!interactive && !draw && options.length > 0 && <ul className={`${canvas ? 'tv-options' : 'options-board'}${ordered || (canvas && input?.layout === 'list') ? ' order' : ''}`}
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
    {device !== 'sharedScreen' && <PhoneFrame caption={t('phone')} pickerLabel={t('phoneModel')} picker={phonePicker}><div className={`phone-screen room room-player ${classes}${compactPhone ? ' compact-game-preview' : ''}`} style={style}>
        <SceneComposition layout={layout} media={contentMedia('player')}>
          <p className="phone-prompt">{phoneLabel}</p>
          {stage.kind === 'info' && <p className="phone-hint">{prompt}</p>}
        </SceneComposition>
        {!interactive && timer && <p className="timer">{theme.timerStyle === 'clock' && typeof stage.durationMs === 'number' ? <ClockFace left={stage.durationMs} total={stage.durationMs} ending={false} up={false} clockwise={theme.timerTurn !== 'counterclockwise'} /> : timer}</p>}
        {minigameCard}
        {practice}
        {!interactive && draw && <DrawBoard options={options} drawn={null} at={null} seed="" waiting={drawHint} />}
        {!interactive && !minigameCard && !draw && (['collect', 'vote', 'route'].includes(stage.kind) && options.length > 0 && !ordered
          ? (input?.layout === 'tiles' || stage.kind === 'route') ? <fieldset className="tiles" style={answerFit(options.map(option => option.label))}>
            <legend>{look.text('answer.legend')}</legend>
            {options.map((option, index) => {
              const mark = answerMark(theme, index, options.length, stage.kind === 'route');
              return <div key={option.key} className="tile">{mark !== null && <span className="answer-mark tile-mark" aria-hidden="true"><Mark text={mark} /></span>}{option.label}</div>;
            })}
          </fieldset> : <div className="phone-list">{options.map(option => <span key={option.key}>{option.label}</span>)}</div>
          : <p className="phone-hint">{phoneHint}</p>)}
      </div></PhoneFrame>}
  </div>;
}

function MinigamePreview({ stage, game, text, compact }: { stage: Stage; game: keyof typeof MINIGAMES; text: ReturnType<typeof buildLook>['text']; compact: boolean }) {
  const t = useTexts(FIELDS_TEXTS);
  const settings = stage['settings'] as { targetMs?: number; course?: string[] } | undefined;
  const explanation = stage['explain'] as { text?: string } | undefined;
  const target = game === 'stop-clock' ? ((settings?.targetMs ?? MINIGAMES['stop-clock'].defaults.targetMs) / 1000).toLocaleString() : null;
  const cue = game === 'stop-clock' ? text('minigame.stop') : game === 'reaction' ? text('minigame.go') : game === 'lucky-doors' ? text('minigame.pickDoor') : null;
  return <div className={`minigame-preview${compact ? ' configuration-game-intro' : ''}`}>
    {game === 'speed-run' ? <SpeedRunBoard {...(settings?.course ? { course: settings.course } : {})} />
      : game === 'brick-rally' ? <BrickMapPreview map={brickMap(BrickSettingsSchema.safeParse(settings).data)} label={gameName(game)} />
      : game === 'draw-the-graph' ? <GraphChart chart={GraphSettingsSchema.safeParse(settings).data?.graph ?? SAMPLE_GRAPH} />
      : <div className={`minigame-preview-symbol game-${game}`} aria-hidden="true">
      <GameSymbol game={game} />
    </div>}
    <div className="minigame-preview-copy">
      {!compact && <h3>{gameName(game)}</h3>}
      {(!compact || game !== 'draw-the-graph') && <p>{compact ? gameDescription(game) : explanation?.text || text(howToPlayKey(game))}</p>}
      {target && <p className="minigame-preview-target"><span>{t('target')}</span><strong>{target} {t('sec')}</strong></p>}
    </div>
    {!compact && cue && <span className="minigame-preview-cue">{cue}</span>}
  </div>;
}

/** The canvas question grows with its text until the author drags its corner; from then on it keeps the author's height. */
function CanvasPrompt({ value, label, readOnly, onChange }: { value: string; label: string; readOnly: boolean; onChange: (value: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const element = field.current;
    if (!element || sized) return;
    // Only the browser's resize handle writes an inline height on this field.
    const watch = new MutationObserver(() => { if (element.style.height) setSized(true); });
    watch.observe(element, { attributes: true, attributeFilter: ['style'] });
    return () => watch.disconnect();
  }, [sized]);
  return <div className="canvas-prompt-box" data-text={value || label} data-sized={sized || undefined}>
    <textarea ref={field} className="tv-prompt canvas-prompt" rows={1} aria-label={label} placeholder={label}
      value={value} readOnly={readOnly} maxLength={2000} onChange={event => onChange(event.target.value)} />
  </div>;
}

export function ScenePreviewDialog({ onClose, initialDevice, ...preview }: PreviewProps & { initialDevice: Device; onClose: () => void }) {
  const t = useTexts(FIELDS_TEXTS);
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const practice = useTexts(PRACTICE_TEXTS);
  const [device, setDevice] = useState(initialDevice);
  const [part, setPart] = useState(preview.index);
  const index = Math.min(part, preview.node.stages.length - 1);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
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
      <p className="practice-note">{practice('practice')}</p>
      {preview.node.stages.length > 1 && <div className="practice-parts">
        <button type="button" disabled={index === 0} onClick={() => setPart(index - 1)}>{practice('previous')}</button>
        <span>{practice('part', { part: index + 1, total: preview.node.stages.length })}</span>
        <button type="button" disabled={index + 1 >= preview.node.stages.length} onClick={() => setPart(index + 1)}>{practice('next')}</button>
      </div>}
      <ScenePreview key={`${preview.node.key}:${preview.node.stages[index]?.key}`} {...preview} index={index} device={device} interactive />
    </div>
  </dialog>;
}

