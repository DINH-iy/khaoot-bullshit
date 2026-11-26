import { useId, useRef, useState } from 'react';
import { COMMIT_NOTES_PATH, PATCH_NOTES, type PatchNoteDay } from './updates.js';
import './patch-notes.css';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' });

export function PatchNotesButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [notes, setNotes] = useState(PATCH_NOTES);
  const request = useRef<AbortController | null>(null);

  async function open() {
    dialog.current?.showModal();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${COMMIT_NOTES_PATH}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const additions: PatchNoteDay[] = await response.json();
      const days = new Map(PATCH_NOTES.map(({ date, changes }) => [date, changes]));
      for (const { date, changes } of additions) days.set(date, [...changes, ...(days.get(date) ?? [])]);
      if (!controller.signal.aborted) {
        setNotes([...days].sort(([left], [right]) => right.localeCompare(left)).map(([date, changes]) => ({ date, changes })));
      }
    } catch {
      // The bundled notes remain readable if the commit history is unavailable.
    }
  }

  return <div className="patch-notes">
    <button className="patch-notes-trigger" type="button" lang="en" aria-haspopup="dialog" onClick={() => void open()}>
      Patch notes
    </button>
    <dialog ref={dialog} className="patch-notes-dialog" lang="en" aria-labelledby={title}>
      <header className="patch-notes-header">
        <h2 id={title}>Patch notes</h2>
        <button type="button" onClick={() => dialog.current?.close()}>Close</button>
      </header>
      <div className="patch-notes-history" role="region" aria-label="Update history" tabIndex={0}>
        {notes.map(({ date, changes }) => <article className="patch-notes-day" key={date}>
          <h3><time dateTime={date}>{dateFormat.format(new Date(date))}</time></h3>
          <ul>{changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        </article>)}
      </div>
    </dialog>
  </div>;
}
