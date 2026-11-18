import { useState } from 'react';
import type { DefinitionIssue } from '@party/contracts';
import type { Definition } from '../model.js';
import { Icon } from '../controls/icons.js';
import { sceneName } from './history-labels.js';

const KEY = 'party.editor.problemsOpen';
const remembered = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = (open: boolean) => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* only for this page */ } };

/**
 * Every problem of the game in one box at the bottom left, in every editor: folded, it is a small
 * "4 problems" button; open, the problems grouped by scene (and those of the whole game). Clicking
 * one goes to its scene. Open or folded is remembered in this browser.
 */
export function ProblemsPanel({ issues, definition, onGo }: { issues: DefinitionIssue[]; definition: Definition; onGo: (nodeKey: string) => void }) {
  const [open, setOpen] = useState(remembered);
  if (!issues.length) return null;
  const toggle = () => { setOpen(!open); remember(!open); };
  // Scenes in the game's own order; problems without a scene under "Whole game".
  const order = new Map(definition.nodes.map((node, index) => [node.key, index]));
  const groups = new Map<string | null, DefinitionIssue[]>();
  for (const issue of issues) { const key = issue.nodeKey && order.has(issue.nodeKey) ? issue.nodeKey : null; groups.set(key, [...(groups.get(key) ?? []), issue]); }
  const sorted = [...groups].sort(([a], [b]) => (a === null ? -1 : order.get(a)!) - (b === null ? -1 : order.get(b)!));
  const count = `${issues.length} ${issues.length === 1 ? 'problem' : 'problems'}`;
  return <section className={`problems-panel${open ? ' open' : ''}`} aria-label="Problems">
    <button type="button" className="problems-toggle" aria-expanded={open} onClick={toggle}>
      <span className="problems-dot" aria-hidden="true">!</span>{count}<span className="problems-caret" aria-hidden="true">{open ? '▾' : '▴'}</span></button>
    {open && <div className="problems-list">
      {sorted.map(([key, list]) => <div key={key ?? 'game'} className="problems-group">
        <h3>{key === null ? 'Whole game' : sceneName(definition, key)}</h3>
        <ul>{list.map((issue, index) => <li key={index}>{key === null ? <p>{issue.message}</p>
          : <button type="button" onClick={() => onGo(key)} title="Go to this scene">
            <span>{issue.stageIndex !== null && (definition.nodes.find(node => node.key === key)?.stages.length ?? 1) > 1 ? `Part ${issue.stageIndex + 1}: ` : ''}{issue.message}</span><Icon name="next" size={16} /></button>}</li>)}</ul>
      </div>)}
    </div>}
  </section>;
}
