import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { RoomCodeSchema } from '@party/contracts';

export function publicJoinUrl(origin: string, code: string): string {
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error('Expected a public origin');
  return `${origin}/?code=${RoomCodeSchema.parse(code)}`;
}

export function JoinQr({ origin, roomCode }: { origin: string; roomCode: string }) {
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
  </div>;
}
