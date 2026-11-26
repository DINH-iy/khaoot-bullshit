import { useId, useLayoutEffect, useRef, useState } from 'react';
import { BRICK_MAX_SECONDS, isMinigameKey, MINIGAME_COUNTDOWN_MS, MINIGAMES, parseMinigameSettings, type MinigameSettings } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { isDefaultGraphQuestion } from '../../minigames/draw-the-graph/graph-question.js';
import { GRAPH_TEXTS } from '../../minigames/draw-the-graph/graph.text.js';
import { gameName } from '../../presentation/catalog.text.js';
import { ROUND_CONTROL_TEXTS } from '../../room/round-control.text.js';
import { Icon } from '../controls/icons.js';
import { updateStage, type Definition, type Node, type Stage } from '../model.js';
import { FIELDS_TEXTS } from './fields.text.js';
import { GraphDataImport, type GraphImport } from './fields/graph-data-import.js';
import { storedGraphs } from '../graph-library/stored-graphs.js';
import { GRAPH_EDITOR_TEXTS } from './fields/graph-editor.text.js';
import { MinigameFields } from './fields/minigame-fields.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { ScenePreview } from './scene-preview.js';
import './minigame-configuration.css';

const TEXTS = defineTexts('minigame-configuration', {
  title: 'Configure minigame', settings: 'Settings', timing: 'Text & timing', apply: 'Apply changes', cancel: 'Cancel',
}, {
  nl: { title: 'Minigame instellen', settings: 'Instellingen', timing: 'Tekst en tijd', apply: 'Wijzigingen toepassen', cancel: 'Annuleren' },
  de: { title: 'Minispiel konfigurieren', settings: 'Einstellungen', timing: 'Text und Zeit', apply: 'Änderungen übernehmen', cancel: 'Abbrechen' },
  ro: { title: 'Configurează minijocul', settings: 'Setări', timing: 'Text și timp', apply: 'Aplică modificările', cancel: 'Anulează' },
});

type EntryPanel = 'import' | 'settings';
type Panel = EntryPanel | 'timing' | 'preview';

type Props = { definition: Definition; node: Node; index: number; onApply: (stage: Stage, graphs: GraphImport[]) => void };

export function MinigameConfiguration(props: Props) {
  const t = useTexts(TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const [open, setOpen] = useState<EntryPanel>();
  const stage = props.node.stages[props.index]!;
  const game = String(stage['game'] ?? '');
  return <div className="ed-chosen">
    {isMinigameKey(game) && <strong>{gameName(game)}</strong>}
    <div className="configuration-launch">
      {game === 'draw-the-graph' && !Array.isArray(stage['draw']) && <button type="button" className="small-button graph-import-launch" aria-haspopup="dialog" onClick={() => setOpen('import')}>
        <Icon name="bars" size={18} />{graphText('importData')}
      </button>}
      <button type="button" className="small-button" aria-haspopup="dialog" onClick={() => setOpen('settings')}>{t('title')}</button>
    </div>
    {open && <ConfigurationDialog {...props} initial={stage} initialPanel={open} onClose={() => setOpen(undefined)} />}
  </div>;
}

function ConfigurationDialog({ definition, node, index, onApply, initial, initialPanel, onClose }: Props & { initial: Stage; initialPanel: EntryPanel; onClose: () => void }) {
  const t = useTexts(TEXTS);
  const fields = useTexts(FIELDS_TEXTS);
  const graphEditor = useTexts(GRAPH_EDITOR_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const inspector = useTexts(INSPECTOR_TEXTS);
  const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const navigation = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initial);
  const [added, setAdded] = useState<GraphImport[]>([]);
  const [device, setDevice] = useState<'phone' | 'sharedScreen'>(initial['game'] === 'count-the-dots' ? 'sharedScreen' : 'phone');
  const [panel, setPanel] = useState<Panel>(initialPanel);
  useLayoutEffect(() => {
    if (device === 'sharedScreen') preview.current?.parentElement?.scrollTo({ top: 0 });
  }, [device]);
  const [returnPanel, setReturnPanel] = useState<Exclude<Panel, 'import'>>();
  const game = String(draft['game'] ?? '');
  const graph = game === 'draw-the-graph' && !Array.isArray(draft['draw']);
  const maxSeconds = game === 'brick-rally' ? BRICK_MAX_SECONDS : 3600;
  const importing = panel === 'import';
  const known = isMinigameKey(game);
  const valid = known && parseMinigameSettings(game, draft['settings']) !== null;
  const gameId = new URLSearchParams(location.search).get('edit') ?? undefined;
  const draftDefinition = updateStage(definition, node.key, index, () => draft);
  const draftNode = draftDefinition.nodes.find(candidate => candidate.key === node.key)!;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const wasImporting = useRef(importing);
  useLayoutEffect(() => {
    if (!importing && wasImporting.current) {
      navigation.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    }
    wasImporting.current = importing;
  }, [importing]);

  const setGraph = ({ graph: data, question }: GraphImport) => {
    setDraft(current => ({
      ...current,
      settings: { ...(current['settings'] as MinigameSettings<'draw-the-graph'> | undefined), graph: data },
      ...(question && isDefaultGraphQuestion(current.prompt) ? { prompt: question } : {}),
    }));
  };
  const saved = storedGraphs(definition);
  const cancel = () => {
    if (importing && returnPanel) setPanel(returnPanel);
    else onClose();
  };

  const compactGraph = graph && device === 'sharedScreen';
  const graphSource = graph && (saved.length > 0 || added.length > 0) && <label className="configuration-graph-source">{graphEditor('fromLibrary')}
    <select value="" onChange={event => {
      const picked = [...saved, ...added][Number(event.currentTarget.value)];
      if (picked) setGraph(picked);
    }}>
      <option value="" disabled>{graphEditor('fromLibrary')}</option>
      {[...saved, ...added].map((item, at) => <option key={at} value={at}>{item.question || item.graph.yLabel || graphText('trendQuestion')}</option>)}
    </select>
  </label>;
  const fieldsPanel = <div key="fields" className="configuration-fields" role="region" aria-label={panel === 'timing' ? t('timing') : t('settings')}>
    <div className="configuration-pane" hidden={panel === 'timing'}>
      {!compactGraph && graphSource}
      <MinigameFields part="settings" compactGraph={compactGraph} graphSource={graphSource} definition={draftDefinition} node={draftNode} index={index}
        onChange={next => {
          const updated = next.nodes.find(candidate => candidate.key === node.key)!.stages[index]!;
          if (updated['game'] !== draft['game']) setDevice(updated['game'] === 'count-the-dots' ? 'sharedScreen' : 'phone');
          setDraft(updated);
        }} />
    </div>
    <div className="configuration-pane" hidden={panel !== 'timing'}>
      <label>{inspector(game === 'draw-the-graph' ? 'graphQuestion' : 'lMinigame')}
        <textarea rows={1} value={draft.prompt ?? ''} maxLength={2000} onChange={event => {
          const prompt = event.currentTarget.value;
          setDraft(previous => ({ ...previous, prompt }));
        }} />
      </label>
      <div className="configuration-timing">
        <label>{inspector(game === 'count-the-dots' ? 'dotGuessTime' : 'timer')}
          <input type="number" inputMode="numeric" min={1} max={maxSeconds} placeholder={known ? String(MINIGAMES[game].defaultSeconds) : undefined}
            value={typeof draft.durationMs === 'number' ? Math.round(draft.durationMs / 1000) : ''} onChange={event => {
              const seconds = event.currentTarget.valueAsNumber;
              const durationMs = Number.isFinite(seconds) ? Math.round(Math.min(3600, Math.max(1, seconds))) * 1000 : null;
              setDraft(previous => ({ ...previous, durationMs }));
            }} />
        </label>
        <label>{rounds('countdown')}
          <input type="number" min={0} max={15} value={Number(draft['countdownSeconds'] ?? MINIGAME_COUNTDOWN_MS / 1000)}
            onChange={event => {
              const countdownSeconds = Number(event.currentTarget.value);
              if (Number.isInteger(countdownSeconds) && countdownSeconds >= 0 && countdownSeconds <= 15) {
                setDraft(previous => ({ ...previous, countdownSeconds }));
              }
            }} />
        </label>
      </div>
    </div>
  </div>;
  const previewPanel = <div key="preview" className="configuration-preview" ref={preview} role="region" aria-label={fields('preview')}>
    <ScenePreview key={JSON.stringify([game, draft['settings'], draft.durationMs, draft['countdownSeconds'], device])}
      definition={draftDefinition} node={draftNode} index={index} device={device} interactive compactIntro />
  </div>;

  return <dialog className="scene-preview-dialog minigame-configuration" data-game={game} data-importing={importing || undefined} ref={dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); cancel(); }}
    onClick={event => { if (event.target === event.currentTarget) cancel(); }}>
    <div className="configuration-window">
      <header>
        <h2 id={title}>{graph ? gameName('draw-the-graph') : t('title')}</h2>
        {importing && <button type="button" className="small-button configuration-import-action" onClick={cancel}>{t('cancel')}</button>}
        {graph && panel !== 'import' && <button type="button" className="small-button configuration-import-action" aria-label={graphText('importData')} onClick={() => {
          setReturnPanel(panel);
          setPanel('import');
        }}>{graphText('importShort')}</button>}
      </header>
      <div className="configuration-toolbar" data-panel={panel} hidden={importing}>
        <div className="segmented configuration-nav" ref={navigation} role="group" aria-label={t('title')}>
          <button type="button" aria-pressed={panel === 'settings'} onClick={() => setPanel('settings')}>{t('settings')}</button>
          <button type="button" aria-pressed={panel === 'timing'} onClick={() => setPanel('timing')}>{t('timing')}</button>
          <button className="configuration-preview-tab" type="button" aria-pressed={panel === 'preview'} onClick={() => setPanel('preview')}>{fields('preview')}</button>
        </div>
        <div className="segmented configuration-devices" role="group" aria-label={fields('preview')}>
          {(['phone', 'sharedScreen'] as const).map(choice => <button type="button" key={choice}
            aria-pressed={device === choice} onClick={() => setDevice(choice)}>{fields(choice)}</button>)}
        </div>
      </div>
      {importing && <GraphDataImport definition={draftDefinition} pending={added} gameId={gameId} destination="scene"
        onImport={(picked, others) => {
          if (picked) setGraph(picked);
          setAdded(current => [...current, ...others]);
          setPanel('settings');
        }} />}
      <div className={`configuration-columns${compactGraph ? ' configuration-compact-graph' : ''}`} data-panel={panel} data-device={device} hidden={importing}>
        {device === 'sharedScreen' ? [previewPanel, fieldsPanel] : [fieldsPanel, previewPanel]}
      </div>
      <footer className="configuration-actions" hidden={importing}>
        <button type="button" className="small-button" autoFocus={!importing} onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="configuration-apply" disabled={!valid} onClick={() => { if (draft !== initial || added.length) onApply(draft, added); onClose(); }}>{t('apply')}</button>
      </footer>
    </div>
  </dialog>;
}
