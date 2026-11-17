import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { RoomCodeSchema } from '@party/contracts';

export function publicJoinUrl(origin: string, code: string): string {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Expected a public origin');
  return `${origin}/?code=${RoomCodeSchema.parse(code)}`;
}

/** Copies a text and says so for a moment. Falls back to selecting nothing silently when the browser refuses. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(timer); }, [copied]);
  const copy = () => { navigator.clipboard.writeText(text).then(() => setCopied('yes'), () => setCopied('no')); };
  return <button type="button" className="small-button copy-button" onClick={copy}>{copied === 'yes' ? 'Copied!' : copied === 'no' ? 'Could not copy' : label}</button>;
}

export function JoinQr({ origin, roomCode, copy = true }: { origin: string; roomCode: string; copy?: boolean }) {
  const url = publicJoinUrl(origin, roomCode);
  const image = useMemo(() => {
    try {
      const qr = qrcode(0, 'M'); qr.addData(url, 'Byte'); qr.make();
      // Four-module quiet zone. Generated locally; no third-party QR service.
      return { src: qr.createDataURL(4, 16), pixels: qr.getModuleCount() * 4 + 32 };
    } catch { return undefined; }
  }, [url]);
  return <div className="join-qr"><h3>Scan to join</h3>
    {image ? <img src={image.src} width={image.pixels} height={image.pixels} alt={`Scan to join room ${roomCode}`} /> : <p>QR unavailable. Use the room code or link below.</p>}
    <p>Room code: <strong>{roomCode}</strong></p><a href={url}>{url}</a>
    {/* Handy for sending the room to someone in a chat; the shared screen has nobody to copy for. */}
    {copy && <div className="copy-row"><CopyButton text={roomCode} label="Copy code" /><CopyButton text={url} label="Copy link" /></div>}
  </div>;
}
