import { SlideAnswers, answerAccent } from '../../presentation/slide-answers.js';
import { AnswerOptionHandles } from './fields/answer-option-handles.js';
import { setAnswerLabel, setAnswerPlacement, setAnswerMarks } from './answer-edits.js';
import { scenePlaceAwards, type SceneTextBox, type AnswerOption } from '@party/contracts';
import { useScenePlaceAwards } from '../../presentation/scene-place-awards.js';
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
import { HOST_TEXTS } from '../../room/host.text.js';
import { PLAY_TEXTS } from '../../room/play.text.js';
import { buildLook, LookContext, themeClass, useThemeStyle } from '../../presentation/look.js';
import { GameSymbol } from '../../presentation/game-symbol.js';
import { gameDescription, gameName } from '../../presentation/catalog.text.js';
import { Mark } from '../../presentation/mark-icons.js';
import { AnswerOptionLabel, withAnswerTranslation, PositionedSlideText, SceneTextBoxes, SlideTextLayer, SceneTextContent, sceneTextProps, usesSlideTypography, withoutMarks } from '../../presentation/scene-text.js';
import { SlideImages } from '../../presentation/slide-images.js';
import { SlideImageHandles } from './fields/slide-image-handles.js';
import { sceneSlideImages, updateSlideImage } from './slide-image-edits.js';
import { SceneComposition } from '../../presentation/scene-composition.js';
import { StageMedia, StageYouTube } from '../../room/stage-media.js';
import { formatRemaining } from '../../room/stage-timer.js';
import { answerFit } from '../../room/answer-fit.js';
import { layerOf } from '../look/layer.js';
import { isDrawScene, withRemappedText, optionsOf, quizKind, uniqueKey, type Definition, type Node, type Stage } from '../model.js';
import { FIELDS_TEXTS } from './fields.text.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { SCENE_PRESENTATION_TEXTS } from './scene-presentation.text.js';
import { MinigamePractice } from './minigame-practice.js';
import { ScenePractice } from './scene-practice.js';
import { PhoneFrame } from '../../ui/phone-devices.js';
import { PRACTICE_TEXTS } from './scene-practice.text.js';
import { ImageHandles } from './fields/image-handles.js';
import { measureTextPlacement, TextBoxHandles } from './fields/text-box-handles.js';
import { CanvasText } from './fields/text-boxes.js';
import { placePrimaryText, primaryTextPlacement, placeSlideTextBox, updateBoxLayout, sceneTextBoxes, sceneTextStyle, updateBoxText, updateTextFormat, type PrimaryTextTarget, type SceneTextTarget } from './text-edits.js';
import { TEXT_BOX_TEXTS } from './fields/text-boxes.text.js';

// `both`: the shared screen and the phone side by side (Look & feel's “This scene”).
type Device = 'sharedScreen' | 'phone' | 'both';
interface PreviewProps { definition: Definition; node: Node; index: number }
interface CanvasControls {
  readOnly: boolean;
  edit: (change: (stage: Stage) => Stage, field: string) => void;
  selectText: (target: SceneTextTarget) => void;
  selectedText: SceneTextTarget;
  selectedImage: string | undefined;
  selectImage: (key?: string) => void;
  selectedAnswer: string | undefined;
  selectAnswer: (key: string) => void;
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
  const boxText = useTexts(TEXT_BOX_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const radioGroup = useId();
  const slideRef = useRef<HTMLDivElement>(null);
  const language = useLanguage();
  const stage = node.stages[index]!;
  const boxes = sceneTextBoxes(stage);
  const awards = scenePlaceAwards(stage);
  const editorPlaceText = useScenePlaceAwards(awards, Boolean(canvas && !canvas.readOnly));
  const placeText = useScenePlaceAwards(awards);
  const images = sceneSlideImages(stage);
  const promptStyle = sceneTextStyle(stage, 'promptStyle');
  const titleStyle = sceneTextStyle(stage, 'titleStyle');
  const promptPlacement = primaryTextPlacement(stage, 'promptStyle');
  const titlePlacement = stage.kind === 'info' ? primaryTextPlacement(stage, 'titleStyle') : undefined;
  const editMainText = (field: 'prompt' | 'title', value: string, caret: number) => canvas?.edit(current =>
    withRemappedText(current, { ...current, [field]: value }, field, caret), field);
  const gameLook = layerOf(definition, { kind: 'game' });
  const sceneLook = layerOf(definition, { kind: 'scene', nodeKey: node.key, stageIndex: index });
  const look = buildLook({ ...mergePresentationTexts(gameLook, sceneLook), themes: [gameLook.theme, sceneLook.theme] }, language);
  const { theme } = look;
  const translations = canvas ? undefined : (stage['translations'] as SceneTranslations | undefined)?.[language];
  const prompt = translations?.prompt ?? stage.prompt ?? '';
  const title = translations?.title ?? String(stage.title ?? '');
  const visiblePromptStyle = prompt === stage.prompt ? promptStyle : withoutMarks(promptStyle);
  const visibleTitleStyle = title === stage.title ? titleStyle : withoutMarks(titleStyle);
  const slideTypography = Boolean(promptStyle || promptPlacement) || usesSlideTypography(stage.kind);
  const label = stage.kind === 'info' ? title : prompt;
  const promptLabel = fields(stage.kind === 'info' ? 'lInfo' : 'lQuestion');
  const timer = typeof stage.durationMs === 'number' && !(stage.kind === 'minigame' && stage['game'] === 'stop-clock') ? look.text('timer.left', { time: formatRemaining(stage.durationMs) }) : null;
  const input = stage['input'] as { kind?: string; options?: AnswerOption[]; items?: { key: string; label: string }[]; layout?: string } | undefined;
  const options = (stage.kind === 'route' ? optionsOf(node) : input?.options ?? input?.items ?? []).map(option =>
    withAnswerTranslation(option, translations?.labels?.[option.key] ?? option.label));
  const media = SceneMediaSchema.safeParse(stage['media']).data;
  const clip = YouTubeClipSchema.safeParse(stage['youtube']).data;
  const layout = MediaLayoutSchema.safeParse(stage['mediaLayout']).data ?? DEFAULT_MEDIA_LAYOUT;
  const contentMedia = (role: 'display' | 'player') => clip
    ? <StageYouTube key={clip.videoId} clip={clip} label={label} role={role} displayConnected preview />
    : media && <StageMedia key={media.id} media={{ ...media, url: sceneMediaUrl(media.id) }} label={label} role={role} displayConnected preview
      renderPicture={role === 'display' && canvas && !canvas.readOnly ? picture =>
        <ImageHandles layout={layout} onChange={patch => canvas.edit(current => ({
          ...current, mediaLayout: { ...(MediaLayoutSchema.safeParse(current['mediaLayout']).data ?? DEFAULT_MEDIA_LAYOUT), ...patch },
        }), 'media-layout')}>{picture}</ImageHandles> : undefined} />;
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
  const canPlaceAnswers = Boolean(canvas && !canvas.readOnly && choices?.length);
  const placedAnswerCount = choices?.filter(choice => choice.placement).length ?? 0;
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
  const renderBox = canvas && !canvas.readOnly ? (box: SceneTextBox, index: number) => {
    const target = `box:${box.key}` as const;
    const label = boxText('box', { number: index + 1 });
    const select = () => canvas.selectText(target);
    return <TextBoxHandles key={box.key} boxKey={target} label={label} placement={box.placement} lines={box.lines} rotation={box.layout?.rotation}
      selected={canvas.selectedText === target && !canvas.selectedImage && !canvas.selectedAnswer} onSelect={select}
      onRotate={rotation => canvas.edit(current => updateBoxLayout(current, box.key, { rotation }), `layout-${box.key}`)}
      onPlace={(next, lines) => canvas.edit(current => placeSlideTextBox(current, box.key, next, lines), `layout-${box.key}`)}>
      <CanvasText value={box.text} label={label} format={box} readOnly={box.source === 'places'} onFocus={select}
        onMarks={box.source === 'places' ? undefined : marks => canvas.edit(current => updateTextFormat(current, target, { marks: marks.length ? marks : undefined }), `textBox-${box.key}-marks`)}
        onChange={(value, caret) => canvas.edit(current => updateBoxText(current, box.key, value, caret), `textBox-${box.key}-text`)} />
    </TextBoxHandles>;
  } : undefined;
  const primaryCanvasText = (target: PrimaryTextTarget) => {
    if (!canvas) return null;
    const isTitle = target === 'titleStyle';
    const field = isTitle ? 'title' : 'prompt';
    const placement = isTitle ? titlePlacement : promptPlacement;
    const format = isTitle ? titleStyle : promptStyle;
    const name = isTitle ? fields('title') : promptLabel;
    const select = () => canvas.selectText(target);
    const content = <CanvasText title={isTitle} main={!isTitle} value={isTitle ? title : prompt} label={name} readOnly={canvas.readOnly}
      format={format} onFocus={select} onChange={(value, caret) => editMainText(field, value, caret)}
      onMarks={canvas.readOnly ? undefined : marks => canvas.edit(current =>
        updateTextFormat(current, target, { marks: marks.length ? marks : undefined }), `${field}-marks`)} />;
    if (canvas.readOnly) return content;
    return <TextBoxHandles boxKey={target} label={name} placement={placement} lines={format?.lines} rotation={placement?.rotation}
      selected={canvas.selectedText === target && !canvas.selectedImage && !canvas.selectedAnswer} onSelect={select}
      onPlace={(next, lines) => canvas.edit(current => placePrimaryText(current, target, { ...placement, ...next }, lines), `${field}-placement`)}
      onRotate={rotation => {
        const measured = placement ?? measureTextPlacement(slideRef.current, target);
        if (measured) canvas.edit(current => placePrimaryText(current, target, { ...measured, rotation }), `${field}-placement`);
      }}>{content}</TextBoxHandles>;
  };
  const positionedTitle = titlePlacement && <PositionedSlideText position={titlePlacement} text={title} format={visibleTitleStyle}
    size="heading" rotation={titlePlacement.rotation ?? 0} />;
  const positionedPrompt = (text: string) => promptPlacement && <PositionedSlideText position={promptPlacement} text={text}
    format={text === prompt ? visiblePromptStyle : withoutMarks(visiblePromptStyle)} rotation={promptPlacement.rotation ?? 0} />;
  const renderAnswer = (option: AnswerOption, position: number) => {
    const mark = ordered ? String(position + 1) : answerMark(theme, position, options.length, stage.kind === 'route');
    const accent = answerAccent(position);
    const content = <>
      {mark && <span className="answer-mark" aria-hidden="true"><Mark text={mark} /></span>}
      {canvas && choices ? <>
        <CanvasText answer label={fields('answerOption', { number: position + 1 })} value={option.label} format={option} readOnly={canvas.readOnly}
          onChange={(label, caret) => canvas.edit(current => setAnswerLabel(current, option.key, label, caret), `option-${option.key}`)}
          onMarks={canvas.readOnly ? undefined : marks => canvas.edit(current => setAnswerMarks(current, option.key, marks), `option-${option.key}-marks`)} />
        {scoring?.kind === 'correct-choice' && <input type="radio" name={radioGroup} aria-label={fields('isCorrect', { label: option.label })} checked={scoring.correctChoiceKey === option.key}
          disabled={canvas.readOnly} onChange={() => canvas.edit(current => ({ ...current, scoring: { ...scoring, correctChoiceKey: option.key } }), 'correct')} />}
      </> : <AnswerOptionLabel option={option} />}
    </>;
    const answer = choices?.[position];
    if (canvas && !canvas.readOnly && answer) return <AnswerOptionHandles key={option.key} option={answer}
      index={position} selected={canvas.selectedAnswer === option.key} select={() => canvas.selectAnswer(option.key)} accent={accent}
      change={placement => canvas.edit(current => setAnswerPlacement(current, option.key, placement), `answer-placement-${option.key}`)}>{content}</AnswerOptionHandles>;
    return <li key={option.key} className={canvas && choices ? 'canvas-answer' : undefined}
      data-authored-answer={placedAnswerCount > 0 || undefined}
      style={{ '--option-accent': accent, '--positioned-answer-color': accent } as React.CSSProperties}>{content}</li>;
  };
  return <div className={canvas ? 'preview scene-canvas' : 'preview'}>
    {device !== 'phone' && <figure className="tv"><figcaption>{t('sharedScreen')}
      {canvas && !canvas.readOnly && usesSlideTypography(stage.kind) && <button type="button" className="canvas-media-button" onClick={canvas.editMedia}>
        {labels(media || clip ? 'editMedia' : 'addMedia')}
      </button>}
    </figcaption>
      <div ref={slideRef} className={`tv-screen room room-display ${classes}`} style={style}
        onPointerDown={canvas && !canvas.readOnly ? event => {
          if (!(event.target as HTMLElement).closest('.scene-slide-image')) canvas.selectImage();
        } : undefined}>
        <SlideImages images={images} {...(canvas && !canvas.readOnly ? { renderImage: (image, index) =>
          <SlideImageHandles key={image.key} image={image} index={index} selected={image.key === canvas.selectedImage}
            select={() => canvas.selectImage(image.key)}
            change={patch => canvas.edit(current => updateSlideImage(current, image.key, patch), `slide-image-${image.key}`)} />,
        } : {})} />
        <SlideTextLayer boxes={boxes} placeText={editorPlaceText} {...(renderBox ? { renderBox } : {})}>
          {titlePlacement && (renderBox ? primaryCanvasText('titleStyle') : positionedTitle)}
          {promptPlacement && (renderBox ? primaryCanvasText('promptStyle') : positionedPrompt(prompt))}
        </SlideTextLayer>
        <SceneComposition layout={layout} media={sharedMedia}>
          {stage.kind === 'info' && !titlePlacement && (canvas ? primaryCanvasText('titleStyle')
            : <p {...sceneTextProps(visibleTitleStyle, 'heading')}><SceneTextContent text={title} format={visibleTitleStyle} /></p>)}
          {!promptPlacement && (canvas ? primaryCanvasText('promptStyle')
            : slideTypography ? <p {...sceneTextProps(visiblePromptStyle)}><SceneTextContent text={prompt} format={visiblePromptStyle} /></p> : <p className="tv-prompt">{prompt}</p>)}
          <SceneTextBoxes boxes={boxes} placeText={editorPlaceText} phoneColumns={stage['textBoxPhoneColumns'] === true}
            {...(renderBox ? { renderBox } : {})} />
        </SceneComposition>
        {!interactive && timer && <p className="timer">{theme.timerStyle === 'clock' && typeof stage.durationMs === 'number' ? <ClockFace left={stage.durationMs} total={stage.durationMs} ending={false} up={false} clockwise={theme.timerTurn !== 'counterclockwise'} /> : timer}</p>}
        {minigameCard}
        {practice}
        {!interactive && draw && <DrawBoard options={options} drawn={null} at={null} seed="" waiting={drawHint} />}
        {!interactive && !draw && options.length > placedAnswerCount && <ul className={`${canvas ? 'tv-options' : 'options-board'}${ordered || (canvas && input?.layout === 'list') ? ' order' : ''}`}
          style={canvas ? undefined : answerFit(options.map(option => option.label))}>
          {options.map((option, position) => choices?.[position]?.placement
            ? <li key={option.key} className="answer-slot-placeholder" aria-hidden="true">{option.label}</li>
            : renderAnswer(option, position))}
        </ul>}
        {canPlaceAnswers ? <ul className="scene-slide-layer scene-slide-answers tv-options" data-editable>
          {options.map((option, position) => choices?.[position]?.placement ? renderAnswer(option, position) : null)}
        </ul> : !interactive && choices && <SlideAnswers options={choices.map((choice, index) => withAnswerTranslation(choice, options[index]?.label ?? choice.label))}
          theme={theme} label={fields('answers')} />}
        {canvas && choices && input && !placedAnswerCount && quizKind(input) !== 'true-false' && choices.length < 12 && <button className="canvas-add-answer" type="button" disabled={canvas.readOnly}
          onClick={() => canvas.edit(current => ({ ...current, input: { ...input, options: [...choices, { key: uniqueKey('answer', choices.map(option => option.key)), label: fields('newAnswer') }] } }), 'answers')}>{fields('addAnswer')}</button>}
        {stage.kind === 'scoreboard' && <ol className="tv-scores"><li>{t('playerOne')} <b>30</b></li><li>{t('playerTwo')} <b>20</b></li><li>{t('playerThree')} <b>10</b></li></ol>}
      </div></figure>}
    {device !== 'sharedScreen' && <PhoneFrame caption={t('phone')} pickerLabel={t('phoneModel')} picker={phonePicker}><div className={`phone-screen room room-player ${classes}${compactPhone ? ' compact-game-preview' : ''}`} style={style}>
        <SlideImages images={images} />
        <SlideTextLayer boxes={boxes} placeText={placeText}>
          {positionedTitle}
          {positionedPrompt(stage.kind === 'info' ? prompt : phoneLabel)}
        </SlideTextLayer>
        <SceneComposition layout={layout} media={contentMedia('player')}>
          {stage.kind === 'info' && !titlePlacement && <p {...sceneTextProps(visibleTitleStyle, 'heading')}><SceneTextContent text={phoneLabel} format={visibleTitleStyle} /></p>}
          {!promptPlacement && (slideTypography ? <p {...sceneTextProps(visiblePromptStyle)}><SceneTextContent text={stage.kind === 'info' ? prompt : phoneLabel}
            format={stage.kind === 'info' || phoneLabel === prompt ? visiblePromptStyle : withoutMarks(visiblePromptStyle)} /></p> : <p className="phone-prompt">{phoneLabel}</p>)}
          <SceneTextBoxes boxes={boxes} placeText={placeText} phoneColumns={stage['textBoxPhoneColumns'] === true} />
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
              return <div key={option.key} className="tile">{mark !== null && <span className="answer-mark tile-mark" aria-hidden="true"><Mark text={mark} /></span>}<AnswerOptionLabel option={option} /></div>;
            })}
          </fieldset> : <div className="phone-list">{options.map(option => <span key={option.key}><AnswerOptionLabel option={option} /></span>)}</div>
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

export function ScenePreviewDialog({ onClose, initialDevice, compactIntro = false, returnToEditor, ...preview }: PreviewProps & {
  initialDevice: Device; onClose: () => void; compactIntro?: boolean; returnToEditor?: boolean;
}) {
  const t = useTexts(FIELDS_TEXTS);
  const labels = useTexts(SCENE_PRESENTATION_TEXTS);
  const host = useTexts(HOST_TEXTS);
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
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="scene-preview-window">
      <header><h2 id={title}>{t('preview')}</h2>
        <button type="button" className="small-button" autoFocus onClick={onClose}>{device === 'phone' && returnToEditor ? host('backToEditor') : labels('close')}</button>
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
      <ScenePreview key={`${preview.node.key}:${preview.node.stages[index]?.key}`} {...preview} index={index} device={device} interactive
        compactIntro={compactIntro || (device === 'sharedScreen' && preview.node.stages[index]?.['game'] === 'draw-the-graph')} />
    </div>
  </dialog>;
}

