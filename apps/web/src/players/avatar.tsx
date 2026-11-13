import { LOOK_COLORS, LOOK_PART_NAMES, type PlayerLook } from '@party/contracts';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { assetUrl } from '../network/media-upload.js';
import { loadDrawing, StoredDrawing } from '../drawing/drawing-view.js';
import './players.css';

const INK = '#1d1b2e';
/** The colour, darkened by `amount` percent (for outlines). */
const shade = (hex: string, amount: number) => `#${[1, 3, 5].map(index => Math.round(parseInt(hex.slice(index, index + 2), 16) * (1 - amount / 100)).toString(16).padStart(2, '0')).join('')}`;

/** Each body, drawn in a 100 × 100 box with the face around (50, 58). */
function body(kind: PlayerLook['body'], fill: string): ReactNode {
  const line = { fill, stroke: shade(fill, 30), strokeWidth: 3 };
  switch (kind) {
    case 'blob': return <path {...line} d="M50 20c20 0 34 12 34 34 0 22-10 34-34 34S14 78 15 56c1-20 15-36 35-36z" />;
    case 'round': return <circle {...line} cx="50" cy="56" r="34" />;
    case 'square': return <rect {...line} x="17" y="23" width="66" height="66" rx="14" />;
    case 'ghost': return <path {...line} d="M18 56c0-20 14-36 32-36s32 16 32 36v32l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" />;
    case 'cat': return <><path {...line} d="M22 40 20 14l22 14z M78 40l2-26-22 14z" /><circle {...line} cx="50" cy="58" r="32" /></>;
    case 'bear': return <><circle {...line} cx="24" cy="30" r="11" /><circle {...line} cx="76" cy="30" r="11" /><circle {...line} cx="50" cy="58" r="32" /></>;
    case 'robot': return <><rect {...line} x="11" y="48" width="8" height="18" rx="3" /><rect {...line} x="81" y="48" width="8" height="18" rx="3" /><rect {...line} x="18" y="26" width="64" height="62" rx="8" /></>;
    case 'alien': return <path {...line} d="M50 22c22 0 36 12 36 30 0 20-18 38-36 38S14 72 14 52c0-18 14-30 36-30z" />;
  }
}
function eyes(kind: PlayerLook['eyes']): ReactNode {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 3.5, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'dots': return <><circle cx="38" cy="52" r="4.5" fill={INK} /><circle cx="62" cy="52" r="4.5" fill={INK} /></>;
    case 'happy': return <><path {...stroke} d="M32 54q6-8 12 0 M56 54q6-8 12 0" /></>;
    case 'wide': return <>{[38, 62].map(x => <g key={x}><circle cx={x} cy="51" r="8.5" fill="#fff" stroke={INK} strokeWidth="2" /><circle cx={x + 1} cy="52" r="4" fill={INK} /></g>)}</>;
    case 'sleepy': return <><path {...stroke} d="M32 53q6 5 12 0 M56 53q6 5 12 0" /><path stroke={INK} strokeWidth="2" d="M31 49h14 M55 49h14" /></>;
    case 'wink': return <><circle cx="38" cy="52" r="4.5" fill={INK} /><path {...stroke} d="M56 53q6-6 12 0" /></>;
    case 'stars': return <>{[38, 62].map(x => <path key={x} fill={INK} d={`M${x} 44l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6-5-2.9-5 2.9 1.2-5.6-4.2-3.8 5.6-.6z`} />)}</>;
    case 'angry': return <><circle cx="38" cy="54" r="4.5" fill={INK} /><circle cx="62" cy="54" r="4.5" fill={INK} /><path {...stroke} d="M30 44l14 5 M70 44l-14 5" /></>;
    case 'cute': return <>{[38, 62].map(x => <g key={x}><circle cx={x} cy="52" r="6.5" fill={INK} /><circle cx={x - 2} cy="49.5" r="2.2" fill="#fff" /></g>)}</>;
  }
}
function mouth(kind: PlayerLook['mouth']): ReactNode {
  const stroke = { fill: 'none', stroke: INK, strokeWidth: 3.5, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'smile': return <path {...stroke} d="M40 68q10 9 20 0" />;
    case 'grin': return <path fill={INK} d="M36 66h28q-2 14-14 14t-14-14z" />;
    case 'open': return <><ellipse cx="50" cy="72" rx="9" ry="8" fill={INK} /><ellipse cx="50" cy="76" rx="5.5" ry="3.5" fill="#ff7a93" /></>;
    case 'tongue': return <><path fill="#ff7a93" d="M45 70h10v6a5 5 0 0 1-10 0z" /><path {...stroke} d="M39 69q11 6 22 0" /></>;
    case 'flat': return <path {...stroke} d="M41 71h18" />;
    case 'o': return <circle cx="50" cy="72" r="5" fill="none" stroke={INK} strokeWidth="3.5" />;
    case 'teeth': return <><rect x="38" y="65" width="24" height="12" rx="4" fill="#fff" stroke={INK} strokeWidth="3" /><path stroke={INK} strokeWidth="2" d="M38 71h24 M46 65v12 M54 65v12" /></>;
    case 'smirk': return <path {...stroke} d="M41 72q12 2 19-6" />;
  }
}
function extra(kind: PlayerLook['extra'], layer: 'under' | 'over'): ReactNode {
  if (layer === 'under') {
    if (kind === 'blush') return <><ellipse cx="29" cy="64" rx="6" ry="3.5" fill="#ff6f91" opacity=".55" /><ellipse cx="71" cy="64" rx="6" ry="3.5" fill="#ff6f91" opacity=".55" /></>;
    if (kind === 'freckles') return <g fill={shade('#a0522d', 10)} opacity=".7">{[[28, 61], [33, 64], [27, 66], [72, 61], [67, 64], [73, 66]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />)}</g>;
    return null;
  }
  switch (kind) {
    case 'glasses': return <g fill="none" stroke={INK} strokeWidth="3"><circle cx="38" cy="52" r="9.5" /><circle cx="62" cy="52" r="9.5" /><path d="M47.5 51h5 M28.5 50l-8-3 M71.5 50l8-3" /></g>;
    case 'shades': return <g><rect x="27" y="45" width="21" height="13" rx="5" fill={INK} /><rect x="52" y="45" width="21" height="13" rx="5" fill={INK} /><path stroke={INK} strokeWidth="3" d="M48 50h4 M27 49l-7-2 M73 49l7-2" /><path stroke="#fff" strokeWidth="2" opacity=".5" d="M31 49l5 0" /></g>;
    case 'mustache': return <path fill={INK} d="M50 63c-4-4-12-5-17 0 4 1 7 4 11 3 3-1 5-2 6-3 1 1 3 2 6 3 4 1 7-2 11-3-5-5-13-4-17 0z" />;
    case 'eyepatch': return <g><path stroke={INK} strokeWidth="2.5" d="M22 42l56 14" /><ellipse cx="38" cy="52" rx="9" ry="8" fill={INK} /></g>;
    case 'bandaid': return <g transform="rotate(-25 70 66)"><rect x="61" y="62" width="18" height="7" rx="3" fill="#f2c79b" stroke={shade('#f2c79b', 30)} strokeWidth="1.5" /><path stroke={shade('#f2c79b', 40)} strokeWidth="1" d="M68 63v5 M72 63v5" /></g>;
    default: return null;
  }
}
function hat(kind: PlayerLook['hat']): ReactNode {
  switch (kind) {
    case 'none': return null;
    case 'crown': return <path fill="#f6c431" stroke="#b8860b" strokeWidth="2.5" strokeLinejoin="round" d="M30 30 28 10l12 10 10-14 10 14 12-10-2 20z" />;
    case 'cap': return <g><path fill="#e8505b" stroke={shade('#e8505b', 30)} strokeWidth="2.5" d="M24 32q2-20 26-20t26 20z" /><path fill={shade('#e8505b', 20)} d="M50 30h36q2 6-6 6H50z" /></g>;
    case 'party': return <g><path fill="#8e5be8" stroke={shade('#8e5be8', 30)} strokeWidth="2.5" strokeLinejoin="round" d="M36 28 52 0l14 26z" /><path stroke="#f6c431" strokeWidth="3" d="M42 18l15 2 M47 9l8 1" /><circle cx="52" cy="2" r="4.5" fill="#f6c431" /></g>;
    case 'beanie': return <g><path fill="#36a2eb" stroke={shade('#36a2eb', 30)} strokeWidth="2.5" d="M22 32q0-24 28-24t28 24z" /><rect x="20" y="27" width="60" height="9" rx="4" fill={shade('#36a2eb', 20)} /><circle cx="50" cy="7" r="5" fill="#fff" stroke={shade('#36a2eb', 30)} strokeWidth="2" /></g>;
    case 'horns': return <g fill="#f4efe1" stroke="#9c8b6b" strokeWidth="2.5"><path d="M28 34Q14 22 20 6q8 14 18 22z" /><path d="M72 34q14-12 8-28-8 14-18 22z" /></g>;
    case 'bow': return <g fill="#f07aa8" stroke={shade('#f07aa8', 30)} strokeWidth="2.5" strokeLinejoin="round"><path d="M66 20 54 10v20zM66 20l12-10v20z" /><circle cx="66" cy="20" r="4.5" /></g>;
    case 'halo': return <ellipse cx="50" cy="10" rx="20" ry="6" fill="none" stroke="#f6c431" strokeWidth="4" />;
    case 'tophat': return <g><rect x="32" y="2" width="36" height="26" rx="3" fill={INK} /><rect x="32" y="20" width="36" height="5" fill="#e8505b" /><rect x="22" y="26" width="56" height="7" rx="3.5" fill={INK} /></g>;
    case 'antenna': return <g><path stroke={INK} strokeWidth="3" d="M50 24V8" /><circle cx="50" cy="7" r="5.5" fill="#f2c230" stroke={INK} strokeWidth="2" /></g>;
  }
}

/** A plain-language description, for screen readers. */
export function describeLook(look: PlayerLook): string {
  const parts = [LOOK_PART_NAMES.body.names[look.body].toLowerCase()];
  if (look.hat !== 'none') parts.push(`with a ${LOOK_PART_NAMES.hat.names[look.hat].toLowerCase()}`);
  if (look.extra !== 'none') parts.push(`${look.hat !== 'none' ? 'and' : 'with'} ${LOOK_PART_NAMES.extra.names[look.extra].toLowerCase()}`);
  if (look.picture) return look.picture.kind === 'photo' ? 'a photo' : 'a drawing';
  return parts.join(' ');
}

/** A player's character. Decorative by default (the name is next to it); give a `label` when it stands alone. */
/** The room the avatars belong to: pictures are fetched from it. Outside a room only characters are shown. */
export const RoomSessionContext = createContext<string | null>(null);

export function Avatar({ look, size = 40, label, className }: { look: PlayerLook; size?: number; label?: string; className?: string }) {
  const sessionId = useContext(RoomSessionContext); const [broken, setBroken] = useState(false);
  // A picture that is gone (removed by the host or cleaned up later) shows the character again.
  const drawn = look.picture?.kind === 'drawing' ? look.picture.assetId : null;
  useEffect(() => { setBroken(false); if (drawn && sessionId) loadDrawing(sessionId, drawn).catch(() => setBroken(true)); }, [drawn, sessionId]);
  const fill = LOOK_COLORS[look.color] ?? LOOK_COLORS[0];
  // A photo or drawn picture, when the player has one; the character is the fallback.
  if (look.picture && sessionId && !broken) {
    const accessible = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
    return <span className={`avatar avatar-picture${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} {...accessible}>
      {look.picture.kind === 'photo' ? <img src={assetUrl(sessionId, look.picture.assetId)} alt="" onError={() => setBroken(true)} />
        : <StoredDrawing sessionId={sessionId} assetIds={[look.picture.assetId]} label="" />}</span>;
  }
  return <svg className={`avatar${className ? ` ${className}` : ''}`} viewBox="0 0 100 100" width={size} height={size} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    {body(look.body, fill)}{extra(look.extra, 'under')}{eyes(look.eyes)}{mouth(look.mouth)}{extra(look.extra, 'over')}{hat(look.hat)}
  </svg>;
}
