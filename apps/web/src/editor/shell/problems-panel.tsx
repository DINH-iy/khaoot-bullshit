import { useCornerPanel } from './corner-panels.js';
import type { DefinitionIssue } from '@party/contracts';
import type { Definition } from '../model.js';
import { Icon } from '../controls/icons.js';
import { sceneName } from './history-labels.js';
import { useTexts } from '../../i18n/texts.js';
import { SHELL_TEXTS } from './shell.text.js';

const KEY = 'party.editor.problemsOpen';

/**
 * Every problem of the game in one box at the bottom left, in every editor: folded, it is a small
 * "4 problems" button; open, the problems grouped by scene (and those of the whole game). Clicking
 * one goes to its scene (one of the whole game opens the game settings). Open or folded is remembered in this browser.
 */
export function ProblemsPanel({ issues, definition, onGo, onGame }: { issues: DefinitionIssue[]; definition: Definition; onGo: (nodeKey: string) => void; onGame: () => void }) {
  const [open, setOpen] = useCornerPanel('problems', KEY); const t = useTexts(SHELL_TEXTS);
  if (!issues.length) return null;
  const toggle = () => setOpen(!open);
  // Scenes in the game's own order; problems without a scene under "Whole game".
  const order = new Map(definition.nodes.map((node, index) => [node.key, index]));
  const groups = new Map<string | null, DefinitionIssue[]>();
  for (const issue of issues) { const key = issue.nodeKey && order.has(issue.nodeKey) ? issue.nodeKey : null; groups.set(key, [...(groups.get(key) ?? []), issue]); }
  const sorted = [...groups].sort(([a], [b]) => (a === null ? -1 : order.get(a)!) - (b === null ? -1 : order.get(b)!));
  const count = t(issues.length === 1 ? 'problemOne' : 'problemMany', { count: issues.length });
  return <section className={`problems-panel${open ? ' open' : ''}`} aria-label={t('problems')}>
    <button type="button" className="problems-toggle" title={count} aria-expanded={open} onClick={toggle}>
      <span className="problems-dot" aria-hidden="true">!</span><span className="corner-label">{count}</span><span className="problems-caret" aria-hidden="true">{open ? '▾' : '▴'}</span></button>
    {open && <div className="problems-list">
      {sorted.map(([key, list]) => <div key={key ?? 'game'} className="problems-group">
        <h3>{key === null ? t('wholeGame') : sceneName(definition, key)}</h3>
        <ul>{list.map((issue, index) => <li key={index}>{key === null
          // A problem of the whole game opens the game settings, where those are set.
          ? <button type="button" onClick={onGame} title={t('openSettings')}><span>{issue.message}</span><Icon name="gear" size={16} /></button>
          : <button type="button" onClick={() => onGo(key)} title={t('goToScene')}>
            <span>{issue.stageIndex !== null && (definition.nodes.find(node => node.key === key)?.stages.length ?? 1) > 1 ? t('part', { number: issue.stageIndex + 1 }) : ''}{issue.message}</span><Icon name="next" size={16} /></button>}</li>)}</ul>
      </div>)}
    </div>}
  </section>;
}
