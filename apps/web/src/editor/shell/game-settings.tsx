import { useEffect, useRef } from 'react';
import { MAX_OPEN_INVITES, OPEN_INVITES_DEFAULT } from '@party/contracts';
import { sceneName } from '../scene/inspector.js';
import { GameMusicFields } from '../scene/fields/music-fields.js';
import { Section } from '../controls/section.js';
import { FinaleSettings, WheelSettings } from './show-settings.js';
import { estimateMinutes, type Definition } from '../model.js';
import { useTexts } from '../../i18n/texts.js';
import { SETTINGS_TEXTS } from './settings.text.js';
import { Dropdown } from '../controls/dropdown.js';

type Change = (next: Definition, group?: string) => void;

/** Teams are not a game setting: a game is solo unless it has Pick teams scenes. This only says which it is. */
function TeamsNote({ definition }: { definition: Definition }) {
  const t = useTexts(SETTINGS_TEXTS);
  const picks = definition.nodes.filter(node => node.stages.some(stage => stage.kind === 'teams'));
  return picks.length
    ? <p className="hint">{t(picks.length === 1 ? 'teamsInOne' : 'teamsInMany', { count: picks.length, scenes: picks.map(node => sceneName(definition, node.key)).join(', ') })}</p>
    : <p className="hint">{t('noTeams')}</p>;
}

/**
 * Everything about the whole game in one place, from the editor's top bar: its
 * name and start, teams and default play, wheels of fortune, the end-of-game
 * awards, and the way to its look. A scene's own settings stay in the scene panel.
 */
export function GameSettingsPanel({ definition, onChange, onLook, onClose, readOnly = false, problems = [] }: { definition: Definition; onChange: Change; onLook: () => void; onClose: () => void; readOnly?: boolean; problems?: { message: string; path: string }[] }) {
  // Each problem shows in the group where it is fixed (by the setting it is about); anything else under General.
  const GROUP: Record<string, string> = { finale: 'awards', wheels: 'wheels', quickTimeSeconds: 'host', sideGames: 'side', chips: 'side' };
  const problemsIn = (group: string) => problems.filter(problem => (GROUP[problem.path.split('.')[0] ?? ''] ?? 'general') === group).map(problem => problem.message);
  const heading = useRef<HTMLHeadingElement>(null); const t = useTexts(SETTINGS_TEXTS);
  useEffect(() => { heading.current?.focus(); }, []);
  const teamGame = definition.nodes.some(node => node.stages.some(stage => stage.kind === 'teams'));
  return <section className="game-settings-panel" aria-labelledby="game-settings-heading" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <div className="inspector-head"><h2 id="game-settings-heading" ref={heading} tabIndex={-1}>{t('gameSettings')}</h2><button className="small-button" onClick={onClose}>{t('close')}</button></div>
    <p className="hint">{t('intro')}</p>
    <fieldset className="view-lock" disabled={readOnly}>
    <Section title={t('general')} memory="General" summary={t('aboutMinutes', { minutes: estimateMinutes(definition) })} open problems={problemsIn('general')}>
      <label>{t('gameName')}<input value={definition.title} maxLength={160} onChange={event => onChange({ ...definition, title: event.target.value }, 'title')} /></label>
      <label>{t('startsWith')}<Dropdown value={definition.startNodeKey} onChange={startNodeKey => onChange({ ...definition, startNodeKey })}
        options={definition.nodes.map(node => ({ value: node.key, label: sceneName(definition, node.key) }))} /></label>
    </Section>
    <Section title={t('teams')} memory="Teams" summary={t(teamGame ? 'teamsMade' : 'everyone')}>
      <TeamsNote definition={definition} />
    </Section>
    {/* Only what differs from the defaults is stored: side games on, chips off. */}
    <Section title={t('side')} memory="Side games & chips" problems={problemsIn('side')} summary={t(definition['sideGames'] === false ? 'noSide' : definition['chips'] === true ? 'sideChips' : 'sideFun')}>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) delete next['sideGames']; else { next['sideGames'] = false; delete next['chips']; } onChange(next); }} />
        {t('sideOn')}</label>
      <label className="choice"><input type="checkbox" checked={definition['sideGames'] !== false && definition['chips'] === true} disabled={definition['sideGames'] === false}
        onChange={event => { const next = { ...definition }; if (event.target.checked) next['chips'] = true; else delete next['chips']; onChange(next); }} />
        {t('withChips')}</label>
      {/* Stored only when it differs from the standard 3. */}
      {definition['sideGames'] !== false && <label className="ed-inline">{t('openInvites')}<span className="ed-unit"><input type="number" inputMode="numeric" min={1} max={MAX_OPEN_INVITES} value={Number(definition['openInvites'] ?? OPEN_INVITES_DEFAULT)}
        onChange={event => { const value = Math.round(Number(event.target.value)); if (!(value >= 1 && value <= MAX_OPEN_INVITES)) return; const next = { ...definition }; if (value === OPEN_INVITES_DEFAULT) delete next['openInvites']; else next['openInvites'] = value; onChange(next); }} /></span></label>}
      <p className="hint">{t('sideHint', { count: Number(definition['openInvites'] ?? OPEN_INVITES_DEFAULT) })}</p>
    </Section>
    {/* Stored only when it differs from 30 seconds. */}
    <Section title={t('music')} memory="Music" summary={(() => { const count = (definition['music'] as { tracks?: unknown[] } | undefined)?.tracks?.length ?? 0; return count ? t(count === 1 ? 'songOne' : 'songMany', { count }) : t('noMusic'); })()}>
      <GameMusicFields definition={definition} onChange={onChange} />
    </Section>
    <Section title={t('hostTools')} memory="Host tools" problems={problemsIn('host')} summary={t('quickTime', { seconds: Number(definition['quickTimeSeconds'] ?? 30) })}>
      <label>{t('quickTimeLabel')}<input type="number" inputMode="numeric" min={5} max={600} step={5} value={Number(definition['quickTimeSeconds'] ?? 30)}
        onChange={event => { const value = Math.round(Number(event.target.value)); if (!(value >= 5 && value <= 600)) return; const next = { ...definition }; if (value === 30) delete next['quickTimeSeconds']; else next['quickTimeSeconds'] = value; onChange(next); }} /></label>
      <p className="hint">{t('quickTimeHint')}</p>
    </Section>
    <WheelSettings definition={definition} onChange={onChange} problems={problemsIn('wheels')} />
    <FinaleSettings definition={definition} onChange={onChange} problems={problemsIn('awards')} />
    </fieldset>
    <Section title={t('look')} memory="Look & feel" summary={t('lookSummary')}>
      <p className="hint">{t('lookHint')}</p>
      <button className="small-button" onClick={() => { onClose(); onLook(); }}>{t('openLook')}</button>
    </Section>
  </section>;
}
