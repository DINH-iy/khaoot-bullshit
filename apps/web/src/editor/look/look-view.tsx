import { useState } from 'react';
import type { Presentation } from '@party/contracts';
import { buildLook, LookContext, themeClass, themeStyle } from '../../presentation/look.js';
import { cardText, type Definition } from '../model.js';
import type { DraftState } from '../use-draft.js';
import { layerOf, withLayer, type Scope } from './layer.js';
import { ThemePanel } from './theme-panel.js';
import { TextsPanel } from './texts-panel.js';
import { AnimationPanel } from './animation-panel.js';
import { LookPreview } from './look-preview.js';
import '../../network/room.css';
import './look.css';

type Section = 'theme' | 'texts' | 'animations';
const SECTIONS: Record<Section, string> = { theme: 'Colours & style', texts: 'Texts', animations: 'Animations' };
const scopeValue = (scope: Scope) => scope.kind === 'game' ? 'game' : `${scope.nodeKey}|${scope.stageIndex}`;

/** The look of the game: style, every text and every animation, for the whole game or for a single scene. */
export function LookView({ d, selected }: { d: DraftState; selected: string[] }) {
  const definition = d.definition!;
  const [scope, setScope] = useState<Scope>(() => { const node = definition.nodes.find(entry => entry.key === selected[0]); return node && selected.length === 1 ? { kind: 'scene', nodeKey: node.key, stageIndex: 0 } : { kind: 'game' }; });
  const [section, setSection] = useState<Section>('theme');
  const live = scope.kind === 'scene' && !definition.nodes.some(node => node.key === scope.nodeKey) ? { kind: 'game' } as Scope : scope;
  const game = layerOf(definition, { kind: 'game' }); const layer = layerOf(definition, live);
  const below: Presentation = live.kind === 'game' ? {} : game;
  const update = (patch: Partial<Presentation>, group: string) => d.change(withLayer(definition, live, { ...layer, ...patch }) as Definition, undefined, `look:${scopeValue(live)}:${group}`);
  // The look the preview shows: the game's, with this scene's changes on top.
  const look = buildLook({ texts: { ...game.texts, ...(live.kind === 'scene' ? layer.texts : {}) }, animations: { ...game.animations, ...(live.kind === 'scene' ? layer.animations : {}) }, themes: [game.theme, live.kind === 'scene' ? layer.theme : undefined].filter(Boolean) });
  const changedScenes = definition.nodes.flatMap(node => node.stages.map((stage, index) => ({ node, index, stage }))).filter(entry => entry.stage['presentation']);
  return <div className="look-editor">
    <aside className="look-controls" aria-labelledby="look-heading">
      <h2 id="look-heading">Look &amp; feel</h2>
      <label>Change the look of<select value={scopeValue(live)} onChange={event => { const value = event.target.value; if (value === 'game') setScope({ kind: 'game' }); else { const [nodeKey, index] = value.split('|') as [string, string]; setScope({ kind: 'scene', nodeKey, stageIndex: Number(index) }); } }}>
        <option value="game">The whole game</option>
        <optgroup label="Only this scene">{definition.nodes.flatMap(node => node.stages.map((stage, index) => <option key={`${node.key}|${index}`} value={`${node.key}|${index}`}>
          {cardText(definition, node).title || node.key}{node.stages.length > 1 ? ` · part ${index + 1}` : ''}{stage['presentation'] ? ' ✎' : ''}</option>))}</optgroup>
      </select></label>
      <p className="hint">{live.kind === 'game' ? 'Changes here apply to every scene, unless a scene has its own.' : 'Changes here apply only to this scene; everything else follows the whole game.'}</p>
      {live.kind === 'game' && changedScenes.length > 0 && <p className="hint">{changedScenes.length} {changedScenes.length === 1 ? 'scene has' : 'scenes have'} its own look (marked ✎).</p>}
      <div className="tabs" role="tablist" aria-label="Part of the look">{(Object.keys(SECTIONS) as Section[]).map(key => <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>{SECTIONS[key]}</button>)}</div>
      {section === 'theme' && <ThemePanel theme={layer.theme} below={live.kind === 'game' ? [] : [game.theme]} onChange={theme => update({ theme }, 'theme')} />}
      {section === 'texts' && <TextsPanel texts={layer.texts} below={below.texts ?? {}} onChange={texts => update({ texts }, 'texts')} />}
      {section === 'animations' && <AnimationPanel animations={layer.animations} below={below.animations ?? {}} onChange={animations => update({ animations }, 'animations')} />}
    </aside>
    <section className="look-preview-area" aria-label="Preview of the look">
      <LookContext.Provider value={look}><LookPreview definition={definition} scope={live} style={themeStyle(look.theme)} className={themeClass(look.theme)} /></LookContext.Provider>
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
  </div>;
}
