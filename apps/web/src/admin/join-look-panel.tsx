import { useEffect, useState } from 'react';
import { resolveTheme, SiteLookSchema, type SiteLook, type Theme } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { themeClass, useThemeStyle } from '../presentation/look.js';
import { ThemePanel } from '../editor/look/theme-panel.js';
import { Icon } from '../editor/controls/icons.js';
import '../editor/editor.css';
import '../editor/look/look.css';

/**
 * Admin → Join screen: the look of the first screen players see (room code and name), with the editor's own
 * style controls and a live preview. Rooms and their scenes keep the look of their game.
 */
export function JoinLookPanel() {
  const [stored, setStored] = useState<SiteLook>(); const [draft, setDraft] = useState<SiteLook>({});
  const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const problem = (cause: unknown) => cause instanceof Error && cause.message === 'UNAUTHORIZED' ? SIGNED_OUT_TEXT : 'That did not work. Try again.';
  useEffect(() => { void roomApi('/api/host/site-look').then(data => { const look = SiteLookSchema.parse(data); setStored(look); setDraft(look); }).catch(cause => setError(problem(cause))); }, []);
  const theme = resolveTheme(draft.theme);
  const style = useThemeStyle(theme);
  if (!stored) return error ? <p role="alert" className="error">{error}</p> : <p role="status">Loading…</p>;
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const save = () => { setError(''); setSaved(false); void roomApi('/api/host/site-look', draft).then(data => { const look = SiteLookSchema.parse(data); setStored(look); setDraft(look); setSaved(true); }).catch(cause => setError(problem(cause))); };
  return <div className="join-look">
    <p className="admin-intro">The first screen players see, where they type the room code and their name. Once a code is typed, the screen takes the look of that room's game; rooms and scenes always use their game's look.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="join-look-grid">
      <div className="editor join-look-controls">
        <ThemePanel noAnswers theme={draft.theme} below={[]} title="Join screen" onChange={(next: Theme | undefined) => { setSaved(false); setDraft(next ? { theme: next } : {}); }} />
      </div>
      <div className="join-look-side">
        <figure className="join-look-preview" aria-label="Preview of the join screen"><figcaption>Preview</figcaption>
          <div className="join-look-phone">
            <main className={`room room-join ${themeClass(theme)}`} style={style} inert>
              <section className="join-card"><p className="brand">party<span>.</span></p>
                <div className="join-head"><h1>Join a game</h1></div>
                <div className="join-form"><label>Room code<input className="code-input" readOnly value="ABC-123" tabIndex={-1} /></label>
                  <label>Your name<input readOnly value="Sam" tabIndex={-1} /></label>
                  <button className="primary big" type="button" tabIndex={-1}>Join</button></div>
              </section>
            </main>
          </div>
        </figure>
        <div className="join-look-actions">
          {saved && !changed && <p role="status" className="packs-saved"><Icon name="check" size={16} /> Saved: players see it now.</p>}
          {changed && <button type="button" onClick={() => setDraft(stored)}>Undo changes</button>}
          <button type="button" className="primary" disabled={!changed} onClick={save}><Icon name="check" size={18} /> Save</button>
        </div>
      </div>
    </div>
  </div>;
}
