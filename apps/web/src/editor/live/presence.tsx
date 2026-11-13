import type { CSSProperties } from 'react';
import type { EditorPeer } from '@party/contracts';
import type { LiveState } from './use-live.js';
import './presence.css';

// One colour per person, each dark enough for white text.
const COLORS = ['#c2255c', '#1864ab', '#237032', '#862e9c', '#b03a0a', '#0b7285', '#5f3dc4', '#7a5a00'];
export const peerColor = (color: number) => COLORS[color % COLORS.length]!;
const tint = (color: number) => ({ '--peer': peerColor(color) }) as CSSProperties;
const VIEWS: Record<EditorPeer['view'], string> = { flow: 'Flow editor', scene: 'Scene editor', look: 'Look & feel' };
export const peersOn = (peers: EditorPeer[], key: string) => peers.filter(peer => peer.selected.includes(key));

/** In the editor's header: your own name for others, and who else is editing right now. */
export function PeerBar({ live }: { live: LiveState }) {
  return <div className="peer-bar">
    {live.peers.length > 0 && <ul className="peer-list" aria-label="Also editing this game">{live.peers.map(peer =>
      <li key={peer.id} className="peer-chip" style={tint(peer.color)} title={`${peer.name} is in the ${VIEWS[peer.view]}`}>
        <span className="peer-dot" aria-hidden="true">{peer.name.slice(0, 1).toUpperCase()}</span>{peer.name}<span className="visually-hidden">, in the {VIEWS[peer.view]}</span></li>)}</ul>}
    <label className="peer-me" style={live.color === null ? undefined : tint(live.color)}><span>You are</span>
      <input value={live.name} maxLength={40} onChange={event => live.setName(event.target.value)} aria-label="Your name, as others editing this game see it" /></label>
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
