import { useEffect, useRef, useState } from 'react';
import { PrefabListSchema, PrefabSchema, type PrefabContent, type PrefabSummary } from '@party/contracts';
import { roomApi } from '../network/api.js';
import { Icon } from './icons.js';
import { SCENE_TYPES, SCENE_VARIANTS, type SceneType } from './model.js';

export interface SceneChoice { type: SceneType; variant?: string }
type View = { kind: 'types' } | { kind: 'variants'; type: SceneType } | { kind: 'prefabs' };
// Whether the last thing the person did was a key press: only then does a menu move
// focus to its first item (a mouse user would just see a stray focus ring).
let usingKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { usingKeyboard = true; }, true);
  window.addEventListener('pointerdown', () => { usingKeyboard = false; }, true);
}

/**
 * The add-a-scene menu (toolbar, + buttons, right-click, dropped connections and
 * new parts). Types with kinds (quiz layouts, every minigame…) open a second menu
 * in the same place; Prefabs opens the saved prefabs when `onPrefab` is given.
 */
export function ScenePalette({ label, onPick, onCancel, onPrefab, only, inline }: {
  label: string; onPick: (choice: SceneChoice) => void; onCancel: () => void;
  onPrefab?: ((content: PrefabContent) => void) | undefined; only?: SceneType[]; inline?: boolean;
}) {
  const [view, setView] = useState<View>({ kind: 'types' });
  const menu = useRef<HTMLDivElement>(null);
  // Keyboard users land on the first item of each menu.
  useEffect(() => { if (usingKeyboard) menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(); }, [view]);
  const types = SCENE_TYPES.filter(type => !only || only.includes(type.type));
  const current = view.kind === 'variants' ? SCENE_TYPES.find(type => type.type === view.type)! : null;
  const heading = view.kind === 'variants' ? `${label} · ${current!.name}` : view.kind === 'prefabs' ? `${label} · Prefabs` : label;
  return <div ref={menu} className={`add-menu${inline ? ' inline' : ''}`} role="menu" aria-label={heading} onPointerDown={event => event.stopPropagation()}>
    <p>{heading}</p>
    {view.kind === 'types' && <>
      {types.map(type => {
        const variants = SCENE_VARIANTS[type.type];
        return <button key={type.type} role="menuitem" aria-haspopup={variants ? 'menu' : undefined} onClick={() => variants ? setView({ kind: 'variants', type: type.type }) : onPick({ type: type.type })}>
          <Icon name={type.icon} /><span><strong>{type.name}</strong><small>{type.hint}</small></span>{variants && <span className="add-more" aria-hidden="true">›</span>}</button>;
      })}
      {onPrefab && <button role="menuitem" aria-haspopup="menu" className="add-prefabs" onClick={() => setView({ kind: 'prefabs' })}>
        <Icon name="prefab" /><span><strong>Prefabs</strong><small>Scenes you saved, ready to insert</small></span><span className="add-more" aria-hidden="true">›</span></button>}
    </>}
    {view.kind === 'variants' && SCENE_VARIANTS[view.type]!.map(variant => <button key={variant.key} role="menuitem" onClick={() => onPick({ type: view.type, variant: variant.key })}>
      <Icon name={current!.icon} /><span><strong>{variant.name}</strong><small>{variant.hint}</small></span></button>)}
    {view.kind === 'prefabs' && onPrefab && <PrefabMenu onInsert={onPrefab} />}
    <div className="add-menu-foot">
      {view.kind !== 'types' ? <button type="button" onClick={() => setView({ kind: 'types' })}>‹ Back</button> : <span />}
      <button type="button" className="add-cancel" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

/** The saved prefabs: insert one, or delete it. Loaded when opened. */
function PrefabMenu({ onInsert }: { onInsert: (content: PrefabContent) => void }) {
  const [prefabs, setPrefabs] = useState<PrefabSummary[]>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => roomApi('/api/host/prefabs').then(data => setPrefabs(PrefabListSchema.parse(data).prefabs)).catch(() => setError('The prefabs could not be loaded. Try again.'));
  useEffect(() => { void load(); }, []);
  const insert = (prefab: PrefabSummary) => {
    setBusy(true); setError('');
    roomApi(`/api/host/prefabs/${prefab.id}`).then(data => onInsert(PrefabSchema.parse(data).content)).catch(() => { setError(`“${prefab.name}” could not be loaded. Try again.`); setBusy(false); });
  };
  const remove = (prefab: PrefabSummary) => {
    if (!confirm(`Delete the prefab “${prefab.name}”? Games it was inserted into keep their scenes.`)) return;
    setBusy(true); void roomApi(`/api/host/prefabs/${prefab.id}/delete`, {}).then(load, () => setError('Deleting did not work. Try again.')).finally(() => setBusy(false));
  };
  if (error) return <p role="alert" className="add-note error">{error}</p>;
  if (!prefabs) return <p role="status" className="add-note">Loading prefabs…</p>;
  if (!prefabs.length) return <p className="add-note">No prefabs yet. Select one or more scenes and press <strong>Save as prefab</strong>; they appear here for every game.</p>;
  return <>{prefabs.map(prefab => <div key={prefab.id} className="prefab-row">
    <button role="menuitem" disabled={busy} onClick={() => insert(prefab)}><Icon name="prefab" /><span><strong>{prefab.name}</strong><small>{prefab.sceneCount === 1 ? '1 scene' : `${prefab.sceneCount} scenes`}</small></span></button>
    <button type="button" className="prefab-delete" disabled={busy} aria-label={`Delete prefab ${prefab.name}`} onClick={() => remove(prefab)}>×</button>
  </div>)}</>;
}
