import { useRef, useState } from 'react';
import { UploadedAssetSchema, type MediaKind, type RoomReply } from '@party/contracts';

export interface UploadedMedia { assetId: string; mediaKind: MediaKind }
export const assetUrl = (sessionId: string, assetId: string) => `/api/rooms/${sessionId}/assets/${assetId}`;
const pickers: Record<MediaKind, string> = { image: 'image/png,image/jpeg,image/webp', gif: 'image/gif', video: 'video/mp4,video/webm,video/quicktime' };
const names: Record<MediaKind, string> = { image: 'a picture', gif: 'a GIF', video: 'a short video' };
const problems: Record<string, string> = {
  FILE_TOO_LARGE: 'That file is too large. Pictures can be up to 8 MB, GIFs 12 MB and videos 40 MB.',
  UNSUPPORTED_MEDIA: 'That file type is not accepted in this round.',
  RATE_LIMITED: 'The server is busy with other uploads. Try again in a moment.',
  STORAGE_FULL: 'This room has no upload space left. Tell the host.',
  INVALID_STATE: 'This round is no longer accepting uploads.', ALREADY_SUBMITTED: 'Your answer is already saved.',
};

/**
 * Still photos are redrawn at a sensible size before upload. That keeps mobile
 * data and server storage small, and drops embedded details such as the
 * location a phone stores in a photo. GIFs and videos are sent unchanged.
 */
async function prepare(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch { return file; }
}
function send(sessionId: string, body: Blob, onProgress: (fraction: number) => void): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    // XMLHttpRequest reports upload progress; fetch cannot.
    const request = new XMLHttpRequest(); request.open('POST', `/api/rooms/${sessionId}/assets`); request.timeout = 115_000;
    request.setRequestHeader('x-party-request', '1'); request.setRequestHeader('content-type', body.type);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onerror = request.ontimeout = () => reject(new Error('NETWORK'));
    request.onload = () => {
      try {
        const reply = JSON.parse(request.responseText) as RoomReply<unknown>;
        if (reply.ok) resolve(UploadedAssetSchema.parse(reply.data)); else reject(new Error(reply.error?.code ?? 'UNSUPPORTED_MEDIA'));
      } catch { reject(new Error(request.status === 415 ? 'UNSUPPORTED_MEDIA' : 'NETWORK')); }
    };
    request.send(body);
  });
}

export function MediaView({ sessionId, media, label }: { sessionId: string; media: UploadedMedia; label: string }) {
  const source = assetUrl(sessionId, media.assetId);
  return media.mediaKind === 'video'
    ? <video className="media" src={source} controls playsInline preload="metadata" aria-label={label} />
    : <img className="media" src={source} alt={label} loading="lazy" />;
}

export function MediaUpload({ sessionId, accept, value, onChange }: { sessionId: string; accept: MediaKind[]; value: UploadedMedia | undefined; onChange: (media: UploadedMedia | undefined) => void }) {
  const [progress, setProgress] = useState<number>(); const [error, setError] = useState(''); const picker = useRef<HTMLInputElement>(null);
  const choose = async (file: File | undefined) => {
    if (!file) return; setError(''); setProgress(0);
    try { onChange(await send(sessionId, await prepare(file), setProgress)); }
    catch (cause) { onChange(undefined); setError(problems[cause instanceof Error ? cause.message : ''] ?? 'The upload did not finish. Check your connection and choose the file again.'); }
    finally { setProgress(undefined); if (picker.current) picker.current.value = ''; }
  };
  const wanted = accept.map(kind => names[kind]).join(accept.length > 2 ? ', ' : ' or ').replace(/, ([^,]*)$/, ' or $1');
  return <div className="media-upload">
    <label>Choose {wanted}<input ref={picker} type="file" accept={accept.map(kind => pickers[kind]).join(',')} disabled={progress !== undefined} onChange={event => { void choose(event.target.files?.[0]); }} /></label>
    {progress !== undefined && <label>Uploading<progress max={1} value={progress} /></label>}
    <p role="status">{progress !== undefined ? `Uploading… ${Math.round(progress * 100)}%` : value ? 'Uploaded. Check it below, then save your answer. Choose another file to replace it.' : ''}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {value && progress === undefined && <MediaView sessionId={sessionId} media={value} label="Your upload" />}
  </div>;
}
