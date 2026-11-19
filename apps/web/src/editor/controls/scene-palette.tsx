import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { PrefabListSchema, PrefabSchema, type PrefabContent, type PrefabSummary } from '@party/contracts';
import { roomApi } from '../../room/api.js';
import { Icon } from './icons.js';
import { translate } from '../../i18n/texts.js';
import { marked } from '../../i18n/rich.js';
import { CONTROLS_TEXTS } from './controls.text.js';
const t = (key: keyof typeof CONTROLS_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROLS_TEXTS, key, values);
import { SCENE_GROUPS, SCENE_TYPES, SCENE_VARIANTS, type SceneType } from '../model.js';

export interface SceneChoice { type: SceneType; variant?: string }
type Tab = string; // a scene group's key, or 'prefabs'
type View = { kind: 'list' | 'variants'; tab: Tab; type?: SceneType };
// Whether the last thing the person did was a key press: only then does a menu move
// focus to its first item (a mouse user would just see a stray focus ring).
let usingKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { usingKeyboard = true; }, true);
  window.addEventListener('pointerdown', () => { usingKeyboard = false; }, true);
}
// The tab the menu opened on last, so adding several scenes of one sort stays one click each.
let lastTab: Tab = SCENE_GROUPS[0]!.key;

/**
 * The add-a-scene menu (toolbar, + buttons, right-click, dropped connections and
 * new parts). Scene types are grouped in tabs (Rounds, Games, Between rounds,
 * Prefabs when `onPrefab` is given). Types with kinds (each minigame and how
 * a duel is won) open a second menu in the same place.
 */
export function ScenePalette({ label, onPick, onCancel, onPrefab, only, inline }: {
  label: string; onPick: (choice: SceneChoice) => void; onCancel: () => void;
  onPrefab?: ((content: PrefabContent) => void) | undefined; only?: SceneType[]; inline?: boolean;
}) {
  const groups = SCENE_GROUPS.map(group => ({ ...group, types: group.types.filter(type => !only || only.includes(type)) })).filter(group => group.types.length);
  const tabs = [...groups.map(group => ({ key: group.key, name: group.name })), ...(onPrefab ? [{ key: 'prefabs', name: t('prefabs') }] : [])];
  const [view, setView] = useState<View>(() => ({ kind: 'list', tab: tabs.some(tab => tab.key === lastTab) ? lastTab : tabs[0]!.key }));
  const menu = useRef<HTMLDivElement>(null); const tabList = useRef<HTMLDivElement>(null); const id = useId();
  // Keyboard users land on the first item when the menu opens or changes level (not when moving between tabs).
  const level = view.kind === 'variants' ? view.type! : 'list';
  useEffect(() => { if (usingKeyboard) menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(); }, [level]);
  const choose = (tab: Tab) => { lastTab = tab; setView({ kind: 'list', tab }); };
  // Arrow keys move between tabs, as in any tab list.
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || view.kind !== 'list') return;
    event.preventDefault();
    const next = tabs[(tabs.findIndex(tab => tab.key === view.tab) + step + tabs.length) % tabs.length]!.key;
    choose(next); requestAnimationFrame(() => tabList.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  };
  const current = view.kind === 'variants' ? SCENE_TYPES.find(type => type.type === view.type)! : null;
  const variants = view.kind === 'variants' ? SCENE_VARIANTS[view.type!] ?? [] : [];
  const heading = current ? `${label} · ${current.name}` : view.tab === 'prefabs' ? t('withPrefabs', { label }) : label;
  const shown = view.kind === 'list' ? groups.find(group => group.key === view.tab)?.types ?? [] : [];
  return <div className={`add-menu${inline ? ' inline' : ''}`} onPointerDown={event => event.stopPropagation()}>
    <p id={`${id}-heading`}>{heading}</p>
    {view.kind === 'list' && tabs.length > 1 && <div ref={tabList} className="add-tabs" role="tablist" aria-label={t('sceneSorts')} onKeyDown={onTabKey}>
      {tabs.map(tab => <button key={tab.key} type="button" role="tab" data-tab={tab.key} id={`${id}-tab-${tab.key}`} aria-selected={view.tab === tab.key} aria-controls={`${id}-list`} tabIndex={view.tab === tab.key ? 0 : -1} onClick={() => choose(tab.key)}>{tab.name}</button>)}
    </div>}
    <div ref={menu} id={`${id}-list`} className="add-list" role="menu" aria-label={heading}>
      {shown.map(type => {
        const info = SCENE_TYPES.find(entry => entry.type === type)!; const variants = SCENE_VARIANTS[type];
        return <button key={type} role="menuitem" aria-haspopup={variants ? 'menu' : undefined} onClick={() => variants ? setView({ kind: 'variants', tab: view.tab, type }) : onPick({ type })}>
          <Icon name={info.icon} /><span><strong>{info.name}</strong><small>{info.hint}</small></span>{variants && <span className="add-more" aria-hidden="true">›</span>}</button>;
      })}
      {variants.map(variant => <button key={variant.key} role="menuitem" onClick={() => onPick({ type: current!.type, variant: variant.key })}>
        <Icon name={current!.icon} /><span><strong>{variant.name}</strong><small>{variant.hint}</small></span></button>)}
      {view.kind === 'list' && view.tab === 'prefabs' && onPrefab && <PrefabMenu onInsert={onPrefab} />}
    </div>
    <div className="add-menu-foot">
      {view.kind === 'variants' ? <button type="button" onClick={() => setView({ kind: 'list', tab: view.tab })}>‹ Back</button> : <span />}
      <button type="button" className="add-cancel" onClick={onCancel}>{t('cancel')}</button>
    </div>
  </div>;
}

/** The saved prefabs: insert one, or delete it. Loaded when opened. */
function PrefabMenu({ onInsert }: { onInsert: (content: PrefabContent) => void }) {
  const [prefabs, setPrefabs] = useState<PrefabSummary[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => roomApi('/api/host/prefabs').then(data => setPrefabs(PrefabListSchema.parse(data).prefabs)).catch(() => setError(t('prefabsFailed')));
  useEffect(() => { void load(); }, []);
  const insert = (prefab: PrefabSummary) => {
    setBusy(true); setError('');
    roomApi(`/api/host/prefabs/${prefab.id}`).then(data => onInsert(PrefabSchema.parse(data).content)).catch(() => { setError(t('prefabFailed', { name: prefab.name })); setBusy(false); });
  };
  const remove = (prefab: PrefabSummary) => {
    if (!confirm(t('deletePrefabAsk', { name: prefab.name }))) return;
    setBusy(true); void roomApi(`/api/host/prefabs/${prefab.id}/delete`, {}).then(load, () => setError(t('deleteFailed'))).finally(() => setBusy(false));
  };
  if (error) return <p role="alert" className="add-note error">{error}</p>;
  if (!prefabs) return <p role="status" className="add-note">{t('loadingPrefabs')}</p>;
  if (!prefabs.length) return <p className="add-note">{marked(t('noPrefabs'))}</p>;
  return <>{prefabs.map(prefab => <div key={prefab.id} className="prefab-row">
    <button role="menuitem" disabled={busy} onClick={() => insert(prefab)}><Icon name="prefab" /><span><strong>{prefab.name}</strong><small>{prefab.sceneCount === 1 ? t('sceneOne') : t('sceneMany', { count: prefab.sceneCount })}</small></span></button>
    <button type="button" className="prefab-delete" disabled={busy} aria-label={t('deletePrefab', { name: prefab.name })} onClick={() => remove(prefab)}>×</button>
  </div>)}</>;
}
