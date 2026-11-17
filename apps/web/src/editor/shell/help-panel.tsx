import { useEffect, useId, useRef, type ReactNode } from 'react';

// ⌘ on a Mac, Ctrl elsewhere: the key the shortcuts are written with.
const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const Keys = ({ keys }: { keys: string }) => <span className="help-keys">{keys.split(' + ').map((key, index) => <span key={index}>{index > 0 && ' + '}<kbd>{key}</kbd></span>)}</span>;
const Row = ({ keys, children }: { keys: string; children: ReactNode }) => <tr><th scope="row"><Keys keys={keys} /></th><td>{children}</td></tr>;

/**
 * Help & shortcuts: how the editor works and every key and gesture, in one place.
 * Opened from the ? button, the ☰ menu or the ? key. Keep it in step with the editor:
 * a new shortcut or gesture belongs here too.
 */
export function HelpPanel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('h2')?.focus(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog help-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="help-head"><h2 id={`${id}-title`} tabIndex={-1}>Help &amp; shortcuts</h2><button type="button" onClick={onClose}>Close</button></div>

      <section aria-labelledby={`${id}-around`}><h3 id={`${id}-around`}>Getting around</h3>
        <ul>
          <li><strong>Flow editor</strong> is the map: add, connect, move and delete scenes, and choose where each leads.</li>
          <li><strong>Scene editor</strong> is the content: questions, answers, parts, points and who plays. Double-click a card (or <em>Edit this scene →</em>) to open it there.</li>
          <li><strong>Look &amp; feel</strong>: colours, fonts, answer marks, every text and the animations, for the whole game or one scene.</li>
          <li><strong>Edit / View</strong>: in View nothing can be changed by accident.</li>
          <li><strong>Play &amp; publish ▾</strong>: rehearse in a practice room, publish, and play the published version. <strong>☰</strong>: Game settings, Invite people, Export as text.</li>
          <li>Everything is saved by itself. Others editing show as coloured initials; their selected scenes have their colour.</li>
        </ul>
      </section>

      <section aria-labelledby={`${id}-map`}><h3 id={`${id}-map`}>On the map (mouse and touch)</h3>
        <table className="help-table"><tbody>
          <Row keys="Scroll">Zoom in and out around the pointer (pinch on a trackpad or phone).</Row>
          <Row keys="Shift + Scroll">Move the map. Dragging an empty spot moves it too; <em>Fit</em> shows the whole game.</Row>
          <Row keys="Click">Select a scene. Click an empty spot to deselect.</Row>
          <Row keys="Shift + Click">Add a scene to the selection (or {mod} + Click).</Row>
          <Row keys="Shift + Drag">Draw a box to select several scenes.</Row>
          <Row keys="Drag">Move the selected scenes; they snap to the grid and line up with each other.</Row>
          <Row keys="Double-click">Open the scene in the Scene editor.</Row>
          <Row keys="Drag ○">Connect: drag from a scene's ○ on its right edge to another scene (or tap the ○, then tap the scene).</Row>
          <Row keys="+">Add a scene connected to that output.</Row>
          <Row keys="Right-click">Add a scene on an empty spot.</Row>
          <Row keys="Click an arrow">Select it: its actions appear at the top of the map (add a scene on it, straighten it, remove it). Drag an arrow's end to move it to another scene.</Row>
          <Row keys="Drag ◌">On a selected arrow: drag a dashed circle to bend the arrow there (to lead it around something); the scenes stay put.</Row>
          <Row keys="Drag ●">Move a bend point; double-click it to remove it. <em>Straighten</em> removes them all.</Row>
        </tbody></table>
      </section>

      <section aria-labelledby={`${id}-keys`}><h3 id={`${id}-keys`}>Keyboard shortcuts</h3>
        <table className="help-table"><tbody>
          <Row keys={`${mod} + Z`}>Undo (only your own changes).</Row>
          <Row keys={`${mod} + Shift + Z`}>Redo (or {mod} + Y).</Row>
          <Row keys={`${mod} + A`}>Select every scene.</Row>
          <Row keys={`${mod} + C`}>Copy the selected scenes, with the connections between them.</Row>
          <Row keys={`${mod} + V`}>Paste them, also into another game.</Row>
          <Row keys={`${mod} + D`}>Duplicate the selected scenes.</Row>
          <Row keys="Delete">Delete the selected scenes (asks first) or the selected connection (or Backspace).</Row>
          <Row keys="Arrow keys">Move the selected scenes a little; with Shift, further.</Row>
          <Row keys="Tab">Go from scene to scene; Enter or Space selects (Shift + Enter adds to the selection).</Row>
          <Row keys="Esc">Cancel connecting, close a menu or popup.</Row>
          <Row keys="?">Open this help.</Row>
        </tbody></table>
      </section>

      <section aria-labelledby={`${id}-menus`}><h3 id={`${id}-menus`}>Menus, lists and popups</h3>
        <ul>
          <li>In a list: <Keys keys="↑" /> <Keys keys="↓" /> move, <Keys keys="Enter" /> chooses, <Keys keys="Esc" /> closes, and typing jumps to a matching entry.</li>
          <li>The add-a-scene menu has tabs (Rounds, Games, Between rounds, Prefabs); <Keys keys="←" /> <Keys keys="→" /> switch between them.</li>
          <li>Settings are in small groups that open and close; they stay as you leave them, also on the next scene.</li>
        </ul>
      </section>
    </div>
  </div>;
}
