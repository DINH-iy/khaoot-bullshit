import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { formatRoomCode, RoomCodeSchema } from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';

export function publicJoinUrl(origin: string, code: string): string {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Expected a public origin');
  return `${origin}/?code=${RoomCodeSchema.parse(code)}`;
}

/** Copies a text and says so for a moment. Falls back to selecting nothing silently when the browser refuses. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(timer); }, [copied]);
  const copy = () => { navigator.clipboard.writeText(text).then(() => setCopied('yes'), () => setCopied('no')); };
  return <button type="button" className="small-button copy-button" onClick={copy}>{copied === 'yes' ? 'Copied!' : copied === 'no' ? 'Could not copy' : label}</button>;
}

/** A QR code for any link, made locally. */
export function useQr(url: string) {
  return useMemo(() => {
    try {
      const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
      // Four-module quiet zone. Generated locally; no third-party QR service.
      return { src: qr.createDataURL(4, 16), pixels: qr.getModuleCount() * 4 + 32 };
    } catch { return undefined; }
  }, [url]);
}

/** A small icon button that copies a text; a tick shows for a moment (a cross when the browser refuses). */
export function CopyIcon({ text, label, icon = 'copy' }: { text: string; label: string; icon?: 'copy' | 'link' }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1600); return () => clearTimeout(timer); }, [copied]);
  return <button type="button" className={`icon-button copy-icon${copied === 'yes' ? ' copied' : ''}`} title={label} aria-label={copied === 'yes' ? 'Copied' : copied === 'no' ? 'Could not copy' : label}
    onClick={() => { navigator.clipboard.writeText(text).then(() => setCopied('yes'), () => setCopied('no')); }}><FaIcon name={copied === 'yes' ? 'check' : copied === 'no' ? 'xmark' : icon} /></button>;
}

/** The join link as a QR code, and (with `link`) the address under it with a copy button. */
export function JoinQr({ origin, roomCode, copy = true, link = true }: { origin: string; roomCode: string; copy?: boolean; link?: boolean }) {
  const url = publicJoinUrl(origin, roomCode);
  const image = useQr(url);
  return <div className="join-qr">
    {image ? <img src={image.src} width={image.pixels} height={image.pixels} alt={`Scan to join room ${roomCode}`} /> : <p>QR unavailable. Use the room code or link.</p>}
    {link && <JoinLink url={url} copy={copy} />}
  </div>;
}
/** The join address, short, with a copy button (handy for a chat; the shared screen has nobody to copy for). */
export function JoinLink({ url, copy }: { url: string; copy: boolean }) {
  return <p className="join-link"><a href={url}>{url.replace(/^https?:\/\//, '')}</a>{copy && <CopyIcon text={url} label="Copy link" />}</p>;
}
/** The room code in big letters, with a copy button for the host. */
export function BigCode({ roomCode, copy }: { roomCode: string; copy: boolean }) {
  return <p className="big-code-row"><span className="big-code" aria-label={`Room code ${roomCode}`}>{formatRoomCode(roomCode)}</span>{copy && <CopyIcon text={roomCode} label="Copy room code" />}</p>;
}
