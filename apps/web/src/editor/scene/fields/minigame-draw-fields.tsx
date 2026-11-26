import { useState } from 'react';
import { isMinigameKey, MINIGAME_KEYS, MINIGAMES, TEAM_MINIGAMES, type MinigameKey } from '@party/contracts';
import { updateStage, type Definition, type Node, type Stage } from '../../model.js';
import { Dropdown } from '../../../ui/dropdown.js';
import { Icon } from '../../controls/icons.js';
import { defineTexts, useTexts } from '../../../i18n/texts.js';
import { gameName } from '../../../presentation/catalog.text.js';

const TEXTS = defineTexts('minigame draw fields', {
  games: 'Games in the draw', gameN: 'Game {number}', edit: 'Change the settings of {game}',
  remove: 'Remove {game} from the draw', add: 'Add a game', hint: 'When the scene starts, one of these games is drawn at random and played here, with its own settings.',
  title: '{game} in the draw', seconds: 'Time to play', done: 'Done', teams: '(teams)',
}, {
  nl: { games: 'Spellen in de loting', gameN: 'Spel {number}', edit: 'Instellingen van {game} aanpassen',
    remove: '{game} uit de loting halen', add: 'Spel toevoegen', hint: 'Als de scène begint, wordt een van deze spellen willekeurig gekozen en hier gespeeld, met zijn eigen instellingen.',
    title: '{game} in de loting', seconds: 'Speeltijd', done: 'Klaar', teams: '(teams)' },
  de: { games: 'Spiele in der Auslosung', gameN: 'Spiel {number}', edit: 'Einstellungen von {game} ändern',
    remove: '{game} aus der Auslosung nehmen', add: 'Spiel hinzufügen', hint: 'Beginnt die Szene, wird eines dieser Spiele zufällig gezogen und hier gespielt, mit seinen eigenen Einstellungen.',
    title: '{game} in der Auslosung', seconds: 'Spielzeit', done: 'Fertig', teams: '(Teams)' },
  ro: { games: 'Jocuri în tragere', gameN: 'Jocul {number}', edit: 'Schimbă setările pentru {game}',
    remove: 'Scoate {game} din tragere', add: 'Adaugă un joc', hint: 'Când începe scena, unul dintre aceste jocuri este tras la sorți și jucat aici, cu propriile setări.',
    title: '{game} în tragere', seconds: 'Timp de joc', done: 'Gata', teams: '(echipe)' },
});

type Entry = { game: string; settings?: Record<string, unknown>; durationMs?: number | null };
type Change = (next: Definition, group?: string) => void;

/**
 * A minigame scene plays one game, or a draw in this one scene: a list of games (each with its own settings and time,
 * changed with the pencil) of which the server draws one when the scene starts. `game` follows the first of them.
 * `settingsFor` renders the game's usual settings for one entry (the scene's own fields, on that game).
 */
export function MinigameDrawFields({ definition, node, index, onChange, settingsFor }: {
  definition: Definition; node: Node; index: number; onChange: Change;
  settingsFor: (stage: Stage, onStage: (next: Stage) => void) => React.ReactNode;
}) {
  const t = useTexts(TEXTS);
  const stage = node.stages[index]!;
  const draw = Array.isArray(stage['draw']) ? stage['draw'] as Entry[] : null;
  const [editing, setEditing] = useState<number | null>(null);
  const edit = (change: (current: Stage) => Stage, field: string) => onChange(updateStage(definition, node.key, index, change), `${node.key}:${index}:${field}`);
  const teams = (stage['play'] as { kind?: string } | undefined)?.kind === 'teams' || (definition['play'] as { kind?: string } | undefined)?.kind === 'teams';
  // The scene's `game` is always the draw's first game, so everything that shows one game shows a real one.
  const setDraw = (next: Entry[], field: string) => edit(current => ({ ...current, draw: next, game: next[0]!.game }), field);
  const playable = (key: MinigameKey) => teams || !TEAM_MINIGAMES.includes(key);
  const unused = MINIGAME_KEYS.find(key => playable(key) && !draw?.some(entry => entry.game === key));
  if (!draw) return null;
  const name = (game: string) => isMinigameKey(game) ? gameName(game) : game;
  const open = editing === null ? null : draw[editing];
  // The pencil: the game's usual settings, shown for a stand-in scene of that game; changes go back into its entry.
  const standIn = open ? { ...stage, game: open.game, settings: open.settings, durationMs: open.durationMs === undefined ? stage.durationMs : open.durationMs, draw: undefined } as Stage : null;
  return <>
    <fieldset className="draw-list"><legend>{t('games')}</legend>
      {draw.map((entry, position) => <div key={entry.game} className="option-row">
        <Dropdown label={t('gameN', { number: position + 1 })} value={entry.game}
          onChange={game => setDraw(draw.map((item, at) => at === position ? { game, durationMs: MINIGAMES[game as MinigameKey].defaultSeconds * 1000 } : item), `draw-${position}`)}
          options={MINIGAME_KEYS.filter(playable).map(key => ({ value: key, label: TEAM_MINIGAMES.includes(key) ? `${gameName(key)} ${t('teams')}` : gameName(key), disabled: key !== entry.game && draw.some(item => item.game === key) }))} />
        {/* Change its settings (before the remove button, which is red and last). */}
        <button type="button" className="small-button icon-only" aria-label={t('edit', { game: name(entry.game) })} title={t('edit', { game: name(entry.game) })} onClick={() => setEditing(position)}><Icon name="edit" size={16} /></button>
        <button type="button" className="small-button icon-only danger-icon" disabled={draw.length <= 2} aria-label={t('remove', { game: name(entry.game) })} title={t('remove', { game: name(entry.game) })}
          onClick={() => setDraw(draw.filter((_, at) => at !== position), 'draw')}><Icon name="trash" size={16} /></button>
      </div>)}
      <button type="button" className="small-button" disabled={draw.length >= 8 || !unused} onClick={() => unused && setDraw([...draw, { game: unused, durationMs: MINIGAMES[unused].defaultSeconds * 1000 }], 'draw')}>
        <Icon name="plus" size={16} /> {t('add')}</button>
      <p className="hint">{t('hint')}</p>
    </fieldset>
    {open && standIn && editing !== null && <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setEditing(null); }}>
      <div className="ed-dialog draw-game-dialog" role="dialog" aria-modal="true" aria-labelledby="draw-game-title" onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }}>
        <h2 id="draw-game-title">{t('title', { game: name(open.game) })}</h2>
        <label>{t('seconds')}<input type="number" min={3} max={600} value={standIn.durationMs ? standIn.durationMs / 1000 : ''}
          onChange={event => { const value = Math.round(Number(event.currentTarget.value)); if (Number.isFinite(value) && value > 0) setDraw(draw.map((item, at) => at === editing ? { ...item, durationMs: Math.min(600, Math.max(3, value)) * 1000 } : item), `draw-${editing}-time`); }} /></label>
        {settingsFor(standIn, next => setDraw(draw.map((item, at) => at === editing ? { game: item.game, ...(next['settings'] ? { settings: next['settings'] as Record<string, unknown> } : {}), ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}) } : item), `draw-${editing}-settings`))}
        <div className="actions"><button type="button" className="accent" onClick={() => setEditing(null)}>{t('done')}</button></div>
      </div>
    </div>}
  </>;
}
