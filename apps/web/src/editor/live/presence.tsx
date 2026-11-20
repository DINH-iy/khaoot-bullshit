import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EditorPeer } from '@party/contracts';
import type { LiveState } from './use-live.js';
import { useTexts } from '../../i18n/texts.js';
import { SETTINGS_TEXTS } from '../shell/settings.text.js';
import { SHELL_TEXTS } from '../shell/shell.text.js';
import { FaIcon } from '../../presentation/icons.js';
import './presence.css';

// One colour per person, each dark enough for white text.
const COLORS = ['#c2255c', '#1864ab', '#237032', '#862e9c', '#b03a0a', '#0b7285', '#5f3dc4', '#7a5a00'];
export const peerColor = (color: number) => COLORS[color % COLORS.length]!;
const tint = (color: number) => ({ '--peer': peerColor(color) }) as CSSProperties;
const VIEWS = { flow: 'viewFlow', scene: 'viewScene', look: 'viewLook' } as const satisfies Record<EditorPeer['view'], keyof typeof SHELL_TEXTS.en>;
export const peersOn = (peers: EditorPeer[], key: string) => peers.filter(peer => peer.selected.includes(key));

/**
 * In the editor's header: who else is editing now ("Also here", a named chip each), and your own
 * initial (marked "You"), which opens the field for the name others see.
 */
export function PeerBar({ live }: { live: LiveState }) {
  const [panel, setPanel] = useState<'name' | 'people'>(); const [listing, setListing] = useState(false); const t = useTexts(SETTINGS_TEXTS); const v = useTexts(SHELL_TEXTS);
  const self = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const people = live.peers.map(peer => <li key={peer.id} style={tint(peer.color)}><span className="peer-dot" aria-hidden="true">{peer.name.slice(0, 1).toUpperCase()}</span>{peer.name}<small>{v(VIEWS[peer.view])}</small></li>);
  useEffect(() => {
    if (!panel) return;
    const closeOutside = (event: PointerEvent) => { if (!self.current?.contains(event.target as Node)) setPanel(undefined); };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [panel]);
  return <div className="peer-bar">
    {/* The others: "Also here", then one other person as a named chip; two or more as their initials overlapping (at
        most three) and a count, which lists everyone with where they are. Keeps the top bar on one line. */}
    {live.peers.length > 0 && <div className={`peer-others${live.peers.length > 1 ? ' crowd' : ''}`}><span className="peer-label" aria-hidden="true">{t('alsoHere')}</span>
      <ul className="peer-list" aria-label={t('alsoEditing')}>{(live.peers.length > 1 ? live.peers.slice(0, 3) : live.peers).map(peer =>
        <li key={peer.id} className="peer-chip" style={tint(peer.color)} title={`${peer.name} · ${v(VIEWS[peer.view])}`}>
          <span className="peer-dot" aria-hidden="true">{peer.name.slice(0, 1).toUpperCase()}</span>{live.peers.length === 1 && <span className="peer-name">{peer.name}</span>}<span className="visually-hidden">{live.peers.length > 1 ? peer.name : ''}, in the {VIEWS[peer.view]}</span></li>)}
        {live.peers.length > 1 && <li className="peer-more"><button type="button" className="peer-more-button" aria-expanded={listing} onClick={() => setListing(!listing)} title={live.peers.map(peer => peer.name).join(', ')}>
          {live.peers.length}<span className="visually-hidden"> people: show everyone</span></button>
          {listing && <ul className="peer-more-list" aria-label={t('everyoneEditing')}>{people}</ul>}</li>}
      </ul></div>}
    <div ref={self} className="peer-me" style={live.color === null ? undefined : tint(live.color)}>
      <button type="button" className="peer-me-button" aria-expanded={panel === 'name'} aria-label={t('youAre', { name: live.name || t('unnamed') })} title={t('youAreTitle', { name: live.name })} onClick={event => { trigger.current = event.currentTarget; setPanel(panel === 'name' ? undefined : 'name'); }}>
        <span className="peer-dot" aria-hidden="true">{(live.name || '?').slice(0, 1).toUpperCase()}</span></button>
      <button type="button" className="peer-compact-button" aria-expanded={panel === 'people'} aria-label={t('everyoneEditing')}
        onClick={event => { trigger.current = event.currentTarget; setPanel(panel === 'people' ? undefined : 'people'); }}>
        <FaIcon name="users" /><span aria-hidden="true">{live.peers.length + 1}</span>
      </button>
      <span className="peer-you" aria-hidden="true">You</span>
      {panel && <div className="peer-me-popover" onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Enter') { event.stopPropagation(); setPanel(undefined); trigger.current?.focus(); }
      }}>
        <label>{t('yourName')}<input autoFocus={panel === 'name'} value={live.name} maxLength={40} onChange={event => live.setName(event.target.value)} aria-label={t('yourNameLabel')} onBlur={panel === 'name' ? () => setPanel(undefined) : undefined} /></label>
        {panel === 'people' && people.length > 0 && <ul className="peer-more-list peer-compact-list" aria-label={t('alsoEditing')}>{people}</ul>}
      </div>}
    </div>
  </div>;
}

/** On a scene card or row: the people who have that scene selected. */
export function PeerTags({ peers, className = 'peer-tags' }: { peers: EditorPeer[]; className?: string }) {
  if (!peers.length) return null;
  return <span className={className}>{peers.map(peer => <span key={peer.id} className="peer-tag" style={tint(peer.color)}>{peer.name}</span>)}<span className="visually-hidden"> {peers.length === 1 ? 'is' : 'are'} working here</span></span>;
}
/** The outline around a card someone else has selected. */
export const peerOutline = (peers: EditorPeer[]): CSSProperties => peers.length ? tint(peers[0]!.color) : {};

/** Other people's pointers on the Flow canvas, in canvas units; `zoom` keeps them the same size at any zoom. */
export function PeerCursors({ live, zoom }: { live: LiveState; zoom: number }) {
  return <>{live.peers.map(peer => {
    const at = live.cursors[peer.id]; if (!at || peer.view !== 'flow') return null;
    return <div key={peer.id} className="peer-cursor" aria-hidden="true" style={{ ...tint(peer.color), left: at.x, top: at.y, transform: `scale(${1 / zoom})` }}>
      <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1 L1 16 L5.5 12 L8.5 19 L11.5 17.7 L8.5 11 L15 11 Z" /></svg><span>{peer.name}</span></div>;
  })}</>;
}
