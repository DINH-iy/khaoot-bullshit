import { useState } from 'react';
import { mergePresentationTexts, type Presentation } from '@party/contracts';
import { buildLook, LookContext, themeClass, useThemeStyle } from '../../presentation/look.js';
import { useLanguage, type Language } from '../../i18n/language.js';
import { cardText, type Definition } from '../model.js';
import type { DraftState } from '../shell/use-draft.js';
import { layerOf, withLayer, type Scope } from './layer.js';
import { ThemePanel } from './theme-panel.js';
import { TranslatedTextsPanel } from './texts-panel.js';
import { AnimationPanel } from './animation-panel.js';
import { PhoneMenuPanel } from './phone-menu-panel.js';
import { LookPreview } from './look-preview.js';
import '../../room/room.css';
import './look.css';
import { Dropdown } from '../../ui/dropdown.js';
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
import { readMemory, rememberPlace } from '../shell/editor-memory.js';

type Section = 'theme' | 'texts' | 'animations' | 'phoneMenu';
const SECTIONS = { theme: 'tabTheme', texts: 'tabTexts', animations: 'tabAnimations', phoneMenu: 'tabPhoneMenu' } as const satisfies Record<Section, keyof typeof LOOK_TEXTS.en>;
const short = (text: string) => text.length > 48 ? `${text.slice(0, 46)}…` : text;
const scopeValue = (scope: Scope) => scope.kind === 'game' ? 'game' : `${scope.nodeKey}|${scope.stageIndex}`;

/** The look of the game: style, every text and every animation, for the whole game or for a single scene. */
export function LookView({ d, selected, gameId }: { d: DraftState; selected: string[]; gameId: string }) {
  const definition = d.definition!;
  const editorLanguage = useLanguage();
  const [textLanguage, setTextLanguage] = useState<Language | ''>('');
  const [scope, setScope] = useState<Scope>(() => { const node = definition.nodes.find(entry => entry.key === selected[0]); return node && selected.length === 1 ? { kind: 'scene', nodeKey: node.key, stageIndex: 0 } : { kind: 'game' }; });
  // The part of Look & feel last open for this game (K2).
  const [section, setSectionState] = useState<Section>(() => { const saved = readMemory(gameId).lookSection; return saved && saved in SECTIONS ? saved as Section : 'theme'; });
  const setSection = (next: Section) => { setSectionState(next); rememberPlace(gameId, { lookSection: next }); };
  const live: Scope = section === 'phoneMenu' || (scope.kind === 'scene' && !definition.nodes.some(node => node.key === scope.nodeKey)) ? { kind: 'game' } : scope;
  const game = layerOf(definition, { kind: 'game' }); const layer = layerOf(definition, live);
  const below: Presentation = live.kind === 'game' ? {} : game;
  const update = (patch: Partial<Presentation>, group: string) => d.change(withLayer(definition, live, { ...layer, ...patch }) as Definition, undefined, `look:${scopeValue(live)}:${group}`);
  // The look the preview shows: the game's, with this scene's changes on top.
  const look = buildLook({ ...mergePresentationTexts(game, live.kind === 'scene' ? layer : undefined), animations: { ...game.animations, ...(live.kind === 'scene' ? layer.animations : {}) }, themes: [game.theme, live.kind === 'scene' ? layer.theme : undefined].filter(Boolean) }, section === 'texts' && textLanguage ? textLanguage : editorLanguage);
  const style = useThemeStyle(look.theme);
  const changedScenes = definition.nodes.flatMap(node => node.stages.map((stage, index) => ({ node, index, stage }))).filter(entry => entry.stage['presentation']);
  return <div className="look-editor">
    <aside className="look-controls" aria-labelledby="look-heading">
      <h2 id="look-heading">{t('look')}</h2>
      <label>{t('lookOf')}<Dropdown disabled={section === 'phoneMenu'} value={scopeValue(live)} onChange={value => { if (value === 'game') setScope({ kind: 'game' }); else { const [nodeKey, index] = value.split('|') as [string, string]; setScope({ kind: 'scene', nodeKey, stageIndex: Number(index) }); } }}
        options={[{ value: 'game', label: t('wholeGame') }, ...definition.nodes.flatMap(node => node.stages.map((stage, index) => ({ value: `${node.key}|${index}`, group: t('onlyScene'),
          label: `${short(cardText(definition, node).title || node.key)}${node.stages.length > 1 ? t('partN', { number: index + 1 }) : ''}${stage['presentation'] ? ' ✎' : ''}` })))]} /></label>
      <p className="hint">{t(live.kind === 'game' ? 'gameHint' : 'sceneHint')}</p>
      {live.kind === 'game' && changedScenes.length > 0 && <p className="hint">{t(changedScenes.length === 1 ? 'ownLookOne' : 'ownLookMany', { count: changedScenes.length })}</p>}
      <div className="tabs" role="tablist" aria-label={t('partOfLook')}>{(Object.keys(SECTIONS) as Section[]).map(key => <button key={key} role="tab" aria-selected={section === key} onClick={() => setSection(key)}>{t(SECTIONS[key])}</button>)}</div>
      <fieldset className="view-lock" disabled={d.readOnly}>
      {section === 'theme' && <ThemePanel theme={layer.theme} below={live.kind === 'game' ? [] : [game.theme]} title={definition.title} onChange={theme => update({ theme }, 'theme')} />}
      {section === 'texts' && <TranslatedTextsPanel layer={layer} below={below} language={textLanguage} onLanguageChange={setTextLanguage} onChange={update} />}
      {section === 'animations' && <AnimationPanel animations={layer.animations} below={below.animations ?? {}} onChange={animations => update({ animations }, 'animations')} />}
      {section === 'phoneMenu' && <PhoneMenuPanel icons={game.phoneMenuIcons} onChange={phoneMenuIcons => update({ phoneMenuIcons }, 'phoneMenuIcons')} />}
      </fieldset>
    </aside>
    <section className="look-preview-area" aria-label={t('previewLabel')}>
      <LookContext.Provider value={look}><LookPreview definition={definition} scope={live} style={style} className={themeClass(look.theme)} /></LookContext.Provider>
      {d.notice && <p role="status" className="flow-notice">{d.notice}</p>}
    </section>
  </div>;
}
