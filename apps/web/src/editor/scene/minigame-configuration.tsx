import { useEffect, useId, useRef, useState } from 'react';
import { isMinigameKey, MINIGAME_COUNTDOWN_MS, MINIGAMES, parseMinigameSettings } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { gameName } from '../../presentation/catalog.text.js';
import { ROUND_CONTROL_TEXTS } from '../../room/round-control.text.js';
import { updateStage, type Definition, type Node, type Stage } from '../model.js';
import { MinigameFields } from './fields/minigame-fields.js';
import { FIELDS_TEXTS } from './fields.text.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { ScenePreview } from './scene-preview.js';

const TEXTS = defineTexts('minigame-configuration', {
  title: 'Configure minigame', settings: 'Settings', apply: 'Apply changes', cancel: 'Cancel',
}, {
  nl: { title: 'Minigame instellen', settings: 'Instellingen', apply: 'Wijzigingen toepassen', cancel: 'Annuleren' },
  de: { title: 'Minispiel konfigurieren', settings: 'Einstellungen', apply: 'Änderungen übernehmen', cancel: 'Abbrechen' },
  ro: { title: 'Configurează minijocul', settings: 'Setări', apply: 'Aplică modificările', cancel: 'Anulează' },
});

type Props = { definition: Definition; node: Node; index: number; onApply: (stage: Stage) => void };

export function MinigameConfiguration(props: Props) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const stage = props.node.stages[props.index]!;
  const game = String(stage['game'] ?? '');
  return <div className="ed-chosen">
    {isMinigameKey(game) && <strong>{gameName(game)}</strong>}
    <button type="button" className="small-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t('title')}</button>
    {open && <ConfigurationDialog {...props} initial={stage} onClose={() => setOpen(false)} />}
  </div>;
}

function ConfigurationDialog({ definition, node, index, onApply, initial, onClose }: Props & { initial: Stage; onClose: () => void }) {
  const t = useTexts(TEXTS);
  const fields = useTexts(FIELDS_TEXTS);
  const inspector = useTexts(INSPECTOR_TEXTS);
  const rounds = useTexts(ROUND_CONTROL_TEXTS);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [draft, setDraft] = useState(initial);
  const [device, setDevice] = useState<'phone' | 'sharedScreen'>(initial['game'] === 'count-the-dots' ? 'sharedScreen' : 'phone');
  const [panel, setPanel] = useState<'settings' | 'preview'>('settings');
  const game = String(draft['game'] ?? '');
  const known = isMinigameKey(game);
  const valid = known && parseMinigameSettings(game, draft['settings']) !== null;
  const draftDefinition = updateStage(definition, node.key, index, () => draft);
  const draftNode = draftDefinition.nodes.find(candidate => candidate.key === node.key)!;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  return <dialog className="scene-preview-dialog minigame-configuration" ref={dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="scene-preview-window">
      <header><h2 id={title}>{t('title')}</h2></header>
      <div className="segmented configuration-nav" role="group" aria-label={t('title')}>
        <button type="button" aria-pressed={panel === 'settings'} onClick={() => setPanel('settings')}>{t('settings')}</button>
        <button type="button" aria-pressed={panel === 'preview'} onClick={() => setPanel('preview')}>{fields('preview')}</button>
      </div>
      <div className="configuration-columns" data-panel={panel}>
        <section className="configuration-fields" aria-label={t('settings')}>
          <MinigameFields part="settings" definition={draftDefinition} node={draftNode} index={index}
            onChange={next => {
              const updated = next.nodes.find(candidate => candidate.key === node.key)!.stages[index]!;
              if (updated['game'] !== draft['game']) setDevice(updated['game'] === 'count-the-dots' ? 'sharedScreen' : 'phone');
              setDraft(updated);
            }} />
          <label>{inspector(game === 'draw-the-graph' ? 'graphQuestion' : 'lMinigame')}
            <textarea rows={2} value={draft.prompt ?? ''} maxLength={2000} onChange={event => {
              const prompt = event.currentTarget.value;
              setDraft(previous => ({ ...previous, prompt }));
            }} />
          </label>
          <div className="configuration-timing">
            <label>{inspector(game === 'count-the-dots' ? 'dotGuessTime' : 'timer')}
              <input type="number" inputMode="numeric" min={1} max={3600} placeholder={known ? String(MINIGAMES[game].defaultSeconds) : undefined}
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
        </section>
        <section className="configuration-preview" aria-label={fields('preview')}>
          <div className="segmented" role="group" aria-label={fields('preview')}>
            {(['phone', 'sharedScreen'] as const).map(choice => <button type="button" key={choice}
              aria-pressed={device === choice} onClick={() => setDevice(choice)}>{fields(choice)}</button>)}
          </div>
          <ScenePreview key={JSON.stringify([game, draft['settings'], draft.durationMs, draft['countdownSeconds'], device])}
            definition={draftDefinition} node={draftNode} index={index} device={device} interactive />
        </section>
      </div>
      <footer className="configuration-actions">
        <button type="button" className="small-button" autoFocus onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="primary" disabled={!valid} onClick={() => { if (draft !== initial) onApply(draft); onClose(); }}>{t('apply')}</button>
      </footer>
    </div>
  </dialog>;
}
