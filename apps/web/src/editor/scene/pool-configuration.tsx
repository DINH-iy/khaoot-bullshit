import { useEffect, useId, useRef, useState } from 'react';
import { DEFAULT_POOL_START, PoolStartSchema, POOL_HEIGHT, POOL_WIDTH, rackPool } from '@party/contracts';
import { paintPool } from '../../head-to-head/eight-ball/table.js';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { INSPECTOR_TEXTS } from './inspector.text.js';
import { DuelFields } from './fields/duel-fields.js';
import { Icon } from '../controls/icons.js';
import type { Stage } from '../model.js';
import './minigame-configuration.css';
import './pool-configuration.css';

const TEXTS = defineTexts('configure-pool', {
  title: 'Configure 8-ball pool', configure: 'Configure pool', match: 'Match', table: 'Table', points: 'Points', preview: 'Pool table preview',
  apply: 'Apply changes', cancel: 'Cancel',
}, {
  nl: { title: '8-ball pool instellen', configure: 'Pool instellen', match: 'Wedstrijd', table: 'Tafel', points: 'Punten', preview: 'Voorbeeld pooltafel', apply: 'Wijzigingen toepassen', cancel: 'Annuleren' },
  de: { title: '8-Ball-Billard konfigurieren', configure: 'Billard einstellen', match: 'Partie', table: 'Tisch', points: 'Punkte', preview: 'Billardtisch-Vorschau', apply: 'Änderungen übernehmen', cancel: 'Abbrechen' },
  ro: { title: 'Configurează biliardul 8-ball', configure: 'Setări biliard', match: 'Meci', table: 'Masă', points: 'Puncte', preview: 'Previzualizare masă de biliard', apply: 'Aplică modificările', cancel: 'Anulează' },
});

type Props = { stage: Stage; onChange: (stage: Stage, field: string) => void; addTeams?: ((stage: Stage) => void) | undefined };

export function PoolConfiguration(props: Props) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  return <div className="pool-configuration-launch">
    <button type="button" className="pool-configure" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Icon name="gear" size={18} /> {t('configure')}
    </button>
    <DuelFields part="contest" stage={props.stage} onChange={props.onChange} />
    {open && <PoolDialog {...props} close={() => setOpen(false)} />}
  </div>;
}

function PoolDialog({ stage, onChange, addTeams, close }: Props & { close: () => void }) {
  const t = useTexts(TEXTS);
  const inspector = useTexts(INSPECTOR_TEXTS);
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [draft, setDraft] = useState(stage);
  const rawStart = (draft['contest'] as { settings?: { start?: unknown } } | undefined)?.settings?.start;
  const previewStart = PoolStartSchema.safeParse(rawStart).data ?? DEFAULT_POOL_START;
  const previewSide = previewStart.side === 'random' ? 'left' : previewStart.side;
  const [panel, setPanel] = useState<'match' | 'table' | 'points'>('match');
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); origin?.focus(); };
  }, []);
  const apply = () => {
    if (draft !== stage) onChange(draft, 'pool-configuration');
    close();
  };
  return <dialog ref={ref} aria-labelledby={title} className="scene-preview-dialog minigame-configuration pool-configuration"
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="configuration-window">
      <header><h2 id={title}>{t('title')}</h2></header>
      <div className="segmented pool-configuration-tabs" role="group" aria-label={t('title')}>
        {(['match', 'table', 'points'] as const).map(key => <button key={key} type="button" aria-pressed={panel === key} onClick={() => setPanel(key)}>{t(key)}</button>)}
      </div>
      <div className="configuration-fields" role="region" aria-label={t(panel)}>
        {panel === 'match' && <>
          <DuelFields part="matchup" stage={draft} onChange={setDraft} addTeams={addTeams ? () => { addTeams(draft); close(); } : undefined} />
          {draft['pick'] !== 'teams' && <label className="ed-inline">{inspector('bettingTime')}
            <span className="ed-unit"><input type="number" inputMode="numeric" min={1} max={3600} placeholder={inspector('none')}
              value={typeof draft.durationMs === 'number' ? Math.round(draft.durationMs / 1000) : ''}
              onChange={event => {
                const seconds = event.currentTarget.valueAsNumber;
                const durationMs = Number.isFinite(seconds) ? Math.round(Math.min(3600, Math.max(1, seconds))) * 1000 : null;
                setDraft(previous => ({ ...previous, durationMs }));
              }} />{inspector('sec')}</span>
          </label>}
        </>}
        {panel === 'table' && <>
          <canvas className="pool-config-table" width={POOL_WIDTH} height={POOL_HEIGHT} role="img" aria-label={t('preview')} ref={canvas => {
            const ctx = canvas?.getContext('2d');
            if (ctx) { const start = { ...previewStart, side: previewSide }; paintPool(ctx, rackPool(start), { start }); }
          }} />
          <DuelFields part="table" stage={draft} onChange={setDraft} />
        </>}
        {panel === 'points' && <DuelFields part="points" stage={draft} onChange={setDraft} />}
      </div>
      <footer className="configuration-actions">
        <button type="button" className="small-button" onClick={close}>{t('cancel')}</button>
        <button type="button" className="configuration-apply" onClick={apply}>{t('apply')}</button>
      </footer>
    </div>
  </dialog>;
}
