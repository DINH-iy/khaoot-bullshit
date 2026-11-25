import { useEffect, useState } from 'react';
import { APP_PERMISSIONS, GAME_PERMISSIONS, RoleListSchema, type Permission, type Role } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { FaIcon } from '../presentation/icons.js';

// Admin → Roles: the owner's own roles and what each may do. People get a role in People; a shared game gets a
// role per person in the editor's Invite people panel. The server checks every permission on every request.

const explain = (cause: unknown) => cause instanceof Error && cause.message === 'UNAUTHORIZED' ? SIGNED_OUT_TEXT
  : cause instanceof Error && cause.message === 'NAME_TAKEN' ? 'Another role already has that name.'
  : cause instanceof Error && cause.message === 'INVALID_STATE' ? 'This role is still in use (or built in), so it cannot be removed.'
  : 'That did not work. Check that the server is running and try again.';

/** What each permission means, in plain words. */
export const PERMISSION_TEXT: Record<Permission, { label: string; hint: string }> = {
  'games.make': { label: 'Make games', hint: 'Make, import and copy their own games, and save styles and prefabs.' },
  'games.all': { label: 'See and edit every game', hint: 'Every game, as if they made it (without being shared).' },
  'media.manage': { label: 'Manage the media library', hint: 'Upload, rename, trim and remove pictures, videos and songs.' },
  'rooms.rehearse': { label: 'Test bench and minigame tryout', hint: 'Practise with virtual phones, outside a game.' },
  'rooms.host': { label: 'Host real rooms', hint: 'Open, enter and close rooms for real players.' },
  'game.view': { label: 'Look at the game', hint: 'Open it in the editor, read only. Without this, the game is hidden.' },
  'game.edit': { label: 'Change the game', hint: 'Edit scenes, settings and the look.' },
  'game.publish': { label: 'Publish', hint: 'Make the draft the version rooms play.' },
  'game.savePoints': { label: 'Save points', hint: 'Make save points and go back to one.' },
  'game.rehearse': { label: 'Rehearse', hint: 'Play the draft in a practice room.' },
  'game.copy': { label: 'Copy', hint: 'Make their own copy (also needs "Make games").' },
  'game.share': { label: 'Share with others', hint: 'Choose who else may work on it, and in which role.' },
  'game.remove': { label: 'Remove the game', hint: 'Take it out of everyone’s list.' },
};

/** The roles, for pickers and the Roles page. */
export function useRoles() {
  const [roles, setRoles] = useState<Role[]>(); const [error, setError] = useState('');
  const load = () => roomApi<unknown>('/api/host/roles').then(data => { setRoles(RoleListSchema.parse(data).roles); setError(''); }).catch(cause => setError(explain(cause)));
  useEffect(() => { void load(); }, []);
  return { roles, error, reload: load };
}

/** A person's role: one of the roles, or none (a player only). */
export function RoleSelect({ value, roles, label, disabled, onChange }: { value: string | null; roles: Role[] | undefined; label: string; disabled?: boolean; onChange: (roleId: string | null) => void }) {
  return <select className="role-select" aria-label={label} value={value ?? ''} disabled={disabled || !roles} onChange={event => onChange(event.target.value || null)}>
    <option value="">Player only</option>
    {roles?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
  </select>;
}

export function RolesPanel() {
  const { roles, error: loadError, reload } = useRoles(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const run = (work: Promise<unknown>) => { setBusy(true); setError(''); void work.then(reload).catch(cause => setError(explain(cause))).finally(() => setBusy(false)); };
  return <>
    <p className="admin-intro">A role is a name and what it may do. Give people a role under People (or none: a player only). When a game is shared with someone, choose their role for that game in the editor (☰ → Invite people). The settings in the first group apply everywhere; those in the second only to a game shared with someone (whoever made a game may always do everything with it). You can always do everything, and this admin menu stays yours alone. Changes apply at once.</p>
    {(error || loadError) && <p role="alert" className="error">{error || loadError}</p>}
    <form className="role-add" onSubmit={event => { event.preventDefault(); run(roomApi('/api/host/roles', { name, permissions: [] }).then(() => setName(''))); }}>
      <label>New role<input value={name} maxLength={40} placeholder="Quizmaster" onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy || !name.trim()}><FaIcon name="plus" /> Add role</button>
    </form>
    {!roles && !loadError && <p role="status">Loading roles…</p>}
    <div className="role-cards">{roles?.map(role => <RoleCard key={`${role.id}:${role.permissions.join(',')}:${role.name}`} role={role} busy={busy} run={run} />)}</div>
  </>;
}

function RoleCard({ role, busy, run }: { role: Role; busy: boolean; run: (work: Promise<unknown>) => void }) {
  const [name, setName] = useState(role.name); const [removing, setRemoving] = useState(false);
  // A tick shows at once; if saving fails it goes back.
  const [permissions, setPermissions] = useState<readonly Permission[]>(role.permissions);
  const save = (next: readonly Permission[]) => { setPermissions(next);
    run(roomApi(`/api/host/roles/${role.id}`, { name: name.trim() || role.name, permissions: next }, 'PUT').catch(cause => { setPermissions(role.permissions); throw cause; })); };
  const toggle = (permission: Permission, on: boolean) => save(on ? [...permissions, permission] : permissions.filter(entry => entry !== permission));
  const group = (title: string, list: readonly Permission[]) => <fieldset className="role-group"><legend>{title}</legend>{list.map(permission =>
    <label key={permission} className="role-permission"><input type="checkbox" checked={permissions.includes(permission)} disabled={busy} onChange={event => toggle(permission, event.target.checked)} />
      <span><strong>{PERMISSION_TEXT[permission].label}</strong><small>{PERMISSION_TEXT[permission].hint}</small></span></label>)}</fieldset>;
  const inUse = role.people > 0 || role.shares > 0;
  return <section className="role-card" aria-label={`Role ${role.name}`}>
    <div className="role-head">
      <label className="role-name"><span className="visually-hidden">Name of {role.name}</span><input value={name} maxLength={40} disabled={busy} onChange={event => setName(event.target.value)}
        onBlur={() => { if (name.trim() && name.trim() !== role.name) save(permissions); else setName(role.name); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
      <span className="admin-meta">{role.builtIn ? 'Built in · ' : ''}{role.people} {role.people === 1 ? 'person' : 'people'} · {role.shares} shared {role.shares === 1 ? 'game' : 'games'}</span>
    </div>
    {group('In the app', APP_PERMISSIONS)}
    {group('On a game shared with them', GAME_PERMISSIONS)}
    {!role.builtIn && <div className="actions">
      {removing ? <><button type="button" className="danger" disabled={busy} onClick={() => run(roomApi(`/api/host/roles/${role.id}/delete`, {}))}>Yes, remove {role.name}</button>
        <button type="button" onClick={() => setRemoving(false)}>Keep it</button></>
        : <button type="button" className="danger" disabled={busy || inUse} title={inUse ? 'Give its people another role first, and change the games shared in it.' : undefined} onClick={() => setRemoving(true)}><FaIcon name="xmark" /> Remove role</button>}
    </div>}
  </section>;
}
