import { useState } from 'react';
import { AWARD_RULES as RULES, FINALE_STATS, resolveTheme, TEXT_DEFAULTS, type AwardRule, type FinaleStat, type TextKey } from '@party/contracts';
import { Segmented } from '../controls/segmented.js';
import { layerOf } from '../look/layer.js';
import { WheelTest } from './wheel-test.js';
import { uniqueKey, updateStage, type Definition, type Node, type Stage } from '../model.js';
import { Section } from '../controls/section.js';
import { ChoiceDialog } from '../controls/choice-dialog.js';
import { Dropdown } from '../controls/dropdown.js';
import { Swatches } from '../controls/swatches.js';
import { useTexts } from '../../i18n/texts.js';
import { SETTINGS_TEXTS } from './settings.text.js';
import { Icon } from '../controls/icons.js';

type Change = (next: Definition, group?: string) => void;
interface Wheel { key: string; title: string; entries: { key: string; label: string }[]; removePicked: boolean; spinSeconds: number; colors?: string[] }
const wheelsOf = (definition: Definition) => (definition['wheels'] as Wheel[] | undefined) ?? [];
const withWheels = (definition: Definition, wheels: Wheel[]): Definition => { const next = { ...definition }; if (wheels.length) next['wheels'] = wheels; else delete next['wheels']; return next; };

/** Wheels of fortune for this game: entries, whether a picked entry leaves the wheel, and how long it spins. */
export function WheelSettings({ definition, onChange, problems = [] }: { definition: Definition; onChange: Change; problems?: string[] }) {
  const wheels = wheelsOf(definition); const t = useTexts(SETTINGS_TEXTS);
  const set = (key: string, change: (wheel: Wheel) => Wheel, field: string) => onChange(withWheels(definition, wheels.map(wheel => wheel.key === key ? change(wheel) : wheel)), `wheel:${key}:${field}`);
  const remove = (key: string) => onChange({ ...withWheels(definition, wheels.filter(wheel => wheel.key !== key)),
    // Scenes that spun this wheel no longer spin anything.
    nodes: definition.nodes.map(node => ({ ...node, stages: node.stages.map(stage => { if ((stage['spin'] as { wheel?: string } | undefined)?.wheel !== key) return stage; const copy = { ...stage }; delete copy['spin']; return copy; }) })) });
  return <Section title={t('wheels')} memory="Wheels of fortune" problems={problems} summary={wheels.length ? wheels.map(wheel => wheel.title).join(', ') : t('none')}>
    <p className="hint">{t('wheelsHint')}</p>
    {wheels.map(wheel => <fieldset key={wheel.key} className="wheel-fields"><legend>{wheel.title}</legend>
      <WheelFields definition={definition} wheel={wheel} set={(change, field) => set(wheel.key, change, field)} onRemove={() => remove(wheel.key)} />
    </fieldset>)}
    <button className="small-button" disabled={wheels.length >= 10} onClick={() => onChange(withWheels(definition, [...wheels, { key: uniqueKey('wheel', wheels.map(wheel => wheel.key)), title: t('newWheel', { number: wheels.length + 1 }), removePicked: true, spinSeconds: 5,
      entries: [{ key: 'entry-1', label: t('sample1') }, { key: 'entry-2', label: t('sample2') }, { key: 'entry-3', label: t('sample3') }] }]))}>{t('addWheel')}</button>
  </Section>;
}

/** One wheel's name, entries, whether a picked entry leaves the wheel, its spin time, its colours, and a test spin. */
function WheelFields({ definition, wheel, set, onRemove }: { definition: Definition; wheel: Wheel; set: (change: (wheel: Wheel) => Wheel, field: string) => void; onRemove?: () => void }) {
  const [testing, setTesting] = useState(false); const t = useTexts(SETTINGS_TEXTS);
  // Without its own colours a wheel uses the game's answer colours (the look's), which are also where own colours start.
  const gameColors = resolveTheme(layerOf(definition, { kind: 'game' }).theme).colors.answers;
  const colors = wheel.colors;
  const setColors = (next: string[] | undefined) => set(current => { const copy = { ...current }; if (next) copy.colors = next; else delete copy.colors; return copy; }, 'colors');
  return <>
    <label>{t('name')}<input value={wheel.title} maxLength={80} onChange={event => set(current => ({ ...current, title: event.target.value }), 'title')} /></label>
    <p className="field-title">{t('entries')}</p>
    {wheel.entries.map((entry, position) => <div key={entry.key} className="option-row">
      <input aria-label={t('entryOf', { number: position + 1, wheel: wheel.title })} value={entry.label} maxLength={80} onChange={event => set(current => ({ ...current, entries: current.entries.map(item => item.key === entry.key ? { ...item, label: event.target.value } : item) }), `entry-${entry.key}`)} />
      <button className="icon-button" disabled={wheel.entries.length <= 2} aria-label={t('removeEntry', { number: position + 1, wheel: wheel.title })} onClick={() => set(current => ({ ...current, entries: current.entries.filter(item => item.key !== entry.key) }), 'entries')}>×</button></div>)}
    <button className="small-button" disabled={wheel.entries.length >= 40} onClick={() => set(current => ({ ...current, entries: [...current.entries, { key: uniqueKey('entry', current.entries.map(item => item.key)), label: t('newEntry') }] }), 'entries')}>{t('addEntry')}</button>
    <label className="choice"><input type="checkbox" checked={wheel.removePicked} onChange={event => set(current => ({ ...current, removePicked: event.target.checked }), 'remove')} />{t('removePicked')}</label>
    <label className="ed-inline">{t('spinTime')}<span className="ed-unit"><input type="number" min={2} max={15} value={wheel.spinSeconds} onChange={event => set(current => ({ ...current, spinSeconds: Math.round(Math.min(15, Math.max(2, Number(event.target.value) || 2))) }), 'seconds')} />{t('sec')}</span></label>
    <Segmented label={t('sliceColours')} value={colors ? 'own' : 'game'} choices={[{ value: 'game', label: t('gameColours') }, { value: 'own', label: t('ownColours') }]}
      onChange={value => setColors(value === 'own' ? gameColors.slice(0, Math.max(2, Math.min(8, gameColors.length))) : undefined)} />
    {colors && <Swatches colors={colors} name={position => t('sliceColour', { number: position + 1, wheel: wheel.title })} removeName={position => t('removeSlice', { number: position + 1 })} addName={t('addSlice')} onChange={setColors} />}
    {/* The wheel's actions side by side: try it, and (in Game settings) remove it. */}
    <div className="wheel-actions">
      <button type="button" className="small-button with-icon" onClick={() => setTesting(true)}><Icon name="play" size={14} />{t('testSpin')}</button>
      {onRemove && <button type="button" className="small-button icon-only danger-icon" aria-label={t('removeWheelLabel', { wheel: wheel.title || t('thisWheel') })} title={t('removeWheel')} onClick={onRemove}><Icon name="trash" size={18} /></button>}
    </div>
    {testing && <WheelTest definition={definition} wheel={wheel} onClose={() => setTesting(false)} />}
  </>;
}

/** A Wheel of fortune scene: the wheel the host spins here, edited right in the scene. */
export function WheelOfScene({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: Change }) {
  const wheels = wheelsOf(definition); const key = (stage['spin'] as { wheel?: string } | undefined)?.wheel;
  const wheel = wheels.find(entry => entry.key === key); const t = useTexts(SETTINGS_TEXTS);
  if (!wheel) return <p className="hint warn">{t('wheelMissing')}</p>;
  return <fieldset className="wheel-fields"><legend>{t('theWheel')}</legend>
    <WheelFields definition={definition} wheel={wheel} set={(change, field) => onChange(withWheels(definition, wheels.map(entry => entry.key === wheel.key ? change(entry) : entry)), `wheel:${wheel.key}:${field}`)} />
    <p className="hint">{t('wheelHint')}</p>
  </fieldset>;
}

/** On a scene: spin one of the game's wheels here, or stop showing the last result. */
export function SpinFields({ definition, node, index, onChange }: { definition: Definition; node: Node; index: number; onChange: Change }) {
  const wheels = wheelsOf(definition); const stage = node.stages[index]!; const spin = (stage['spin'] as { wheel?: string } | undefined)?.wheel ?? ''; const t = useTexts(SETTINGS_TEXTS);
  if (!wheels.length) return null;
  const edit = (change: (current: Stage) => Stage) => onChange(updateStage(definition, node.key, index, change));
  return <fieldset><legend>{t('wheelOfFortune')}</legend>
    <label>{t('onThisScene')}<Dropdown value={spin} onChange={wheel => edit(current => { const copy = { ...current }; if (wheel) copy['spin'] = { wheel }; else delete copy['spin']; return copy; })}
      options={[{ value: '', label: t('noWheel') }, ...wheels.map(wheel => ({ value: wheel.key, label: t('hostSpins', { wheel: wheel.title }) }))]} /></label>
    <label className="choice"><input type="checkbox" checked={Boolean(stage['wheelClear'])} onChange={event => edit(current => { const copy = { ...current }; if (event.target.checked) copy['wheelClear'] = true; else delete copy['wheelClear']; return copy; })} />
      {t('wheelClear')}</label>
  </fieldset>;
}

// How each award is decided (as the server works it out), for the add-an-award popup.
const AWARD_RULES = { winner: 'rWinner', mostCorrect: 'rMostCorrect', mostWrong: 'rMostWrong', fastest: 'rFastest', slowest: 'rSlowest', mostVotes: 'rMostVotes',
  minigameChamp: 'rMinigameChamp', luckiest: 'rLuckiest', mostReactions: 'rMostReactions', scene: 'rScene', fewest: 'rFewest' } as const satisfies Record<AwardRule, keyof typeof SETTINGS_TEXTS.en>;
interface Award { rule: AwardRule; title?: string; nodeKey?: string }
/**
 * The end-of-game show: which awards appear, in which order, each with its own title if
 * wanted; "best in one scene" names its scene. Awards without anything to show are skipped
 * by themselves. Older games keep a plain list of rules; it becomes this list when edited.
 */
export function FinaleSettings({ definition, onChange, problems = [] }: { definition: Definition; onChange: Change; problems?: string[] }) {
  const finale = definition['finale'] as { stats?: FinaleStat[]; awards?: Award[] } | undefined; const t = useTexts(SETTINGS_TEXTS);
  const chosen: Award[] = finale?.awards ?? (finale?.stats ?? [...FINALE_STATS]).map(rule => ({ rule }));
  const set = (awards: Award[], field = 'finale') => onChange({ ...definition, finale: { awards } }, field);
  const standard = (rule: AwardRule) => TEXT_DEFAULTS[`stat.${rule}` as TextKey];
  const shown = (award: Award) => award.title || standard(award.rule);
  const update = (position: number, change: Partial<Award>) => set(chosen.map((award, at) => { if (at !== position) return award; const next = { ...award, ...change }; if (!next.title) delete next.title; return next; }), `finale:${position}`);
  // Each statistic once; "best in one scene" as often as wanted.
  const available = RULES.filter(rule => rule === 'scene' || !chosen.some(award => award.rule === rule)); const [picking, setPicking] = useState(false);
  const scenes = definition.nodes.map(node => ({ value: node.key, label: sceneLabel(definition, node.key) }));
  return <Section title={t('awards')} memory="End-of-game awards" problems={problems} summary={chosen.length ? t('awardCount', { count: chosen.length }) : t('none')}>
    <p className="hint">{t('awardsHint')}</p>
    <ol className="award-list">{chosen.map((award, position) => <li key={position}>
      <div className="award-main">
        <input aria-label={t('awardTitle', { number: position + 1 })} value={award.title ?? ''} placeholder={standard(award.rule)} maxLength={60} onChange={event => update(position, { title: event.target.value })} />
        <small>{award.rule === 'scene' ? t('mostPointsIn') : t(AWARD_RULES[award.rule])}</small>
        {award.rule === 'scene' && <label className="visually-hidden-label"><span className="visually-hidden">Scene of award {position + 1}</span><Dropdown value={award.nodeKey ?? ''} placeholder="Choose a scene" options={scenes} onChange={nodeKey => update(position, { nodeKey })} /></label>}
      </div>
      <button className="icon-button" aria-label={t('moveUp', { award: shown(award) })} disabled={position === 0} onClick={() => { const next = [...chosen]; [next[position - 1], next[position]] = [next[position]!, next[position - 1]!]; set(next); }}>↑</button>
      <button className="icon-button" aria-label={t('remove', { award: shown(award) })} onClick={() => set(chosen.filter((_, at) => at !== position))}>×</button></li>)}</ol>
    {chosen.length === 0 && <p className="hint">{t('noAwards')}</p>}
    {available.length > 0 && chosen.length < 16 && <button type="button" className="small-button" onClick={() => setPicking(true)}>{t('addAward')}</button>}
    {picking && <ChoiceDialog title={t('addAwardTitle')} intro={t('addAwardIntro')} choices={available.map(rule => ({ value: rule, label: standard(rule), description: t(AWARD_RULES[rule]), icon: 'scoreboard' }))}
      onPick={rule => { setPicking(false); const first = definition.nodes[0]?.key; set([...chosen, rule === 'scene' && first ? { rule: 'scene', nodeKey: first } : { rule: rule as AwardRule }]); }} onClose={() => setPicking(false)} />}
  </Section>;
}
// A scene's name for the award's scene list.
function sceneLabel(definition: Definition, key: string) {
  const node = definition.nodes.find(entry => entry.key === key); const stage = node?.stages[0];
  const text = String(stage?.title ?? stage?.prompt ?? key); return text.length > 50 ? `${text.slice(0, 48)}…` : text;
}
