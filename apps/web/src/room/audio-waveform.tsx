import { useEffect, useId, useMemo, useState } from 'react';
import { LIBRARY_LIMITS } from '@party/contracts';

const PEAK_COUNT = 192;
const MAX_SECONDS = 20 * 60;
const peaksByFile = new Map<string, Promise<number[] | null>>();

function filePeaks(url: string) {
  const cached = peaksByFile.get(url);
  if (cached) return cached;
  if (peaksByFile.size >= 24) peaksByFile.delete(peaksByFile.keys().next().value!);
  const pending = fetch(url, { signal: AbortSignal.timeout(20_000) }).then(async response => {
    if (!response.ok || Number(response.headers.get('content-length')) > LIBRARY_LIMITS.audio) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > LIBRARY_LIMITS.audio) return null;
    const context = new OfflineAudioContext(1, 1, 8000);
    const audio = await context.decodeAudioData(bytes);
    const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, channel) => audio.getChannelData(channel));
    const peaks = Array.from({ length: PEAK_COUNT }, (_, index) => {
      const start = Math.floor(index * audio.length / PEAK_COUNT);
      const end = Math.floor((index + 1) * audio.length / PEAK_COUNT);
      const step = Math.max(1, Math.floor((end - start) / 64));
      let peak = 0;
      for (const samples of channels) {
        for (let at = start; at < end; at += step) peak = Math.max(peak, Math.abs(samples[at]!));
      }
      return peak;
    });
    const max = Math.max(0.03, ...peaks);
    return peaks.map(peak => peak / max);
  }).catch(() => { peaksByFile.delete(url); return null; });
  peaksByFile.set(url, pending);
  return pending;
}

export function AudioWaveform({ url, duration, currentTime, start, end }: {
  url: string; duration: number; currentTime: number; start: number; end?: number | undefined;
}) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const gradient = useId();
  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) return;
    let live = true;
    void filePeaks(url).then(values => { if (live) setPeaks(values); });
    return () => { live = false; };
  }, [url, duration]);
  const clipEnd = Math.min(duration, end ?? duration);
  const shape = useMemo(() => {
    if (!peaks || !Number.isFinite(duration) || clipEnd <= start) return null;
    const first = Math.floor(start / duration * peaks.length);
    const last = Math.ceil(clipEnd / duration * peaks.length);
    const track = peaks.slice(first, last);
    if (!track.length) return null;
    if (track.length === 1) track.push(track[0]!);
    const points = track.map((amplitude, index) => ({ x: index / (track.length - 1) * 100, y: amplitude * 22 }));
    const top = points.map(({ x, y }) => `${x.toFixed(2)},${(24 - y).toFixed(2)}`);
    const bottom = points.reverse().map(({ x, y }) => `${x.toFixed(2)},${(24 + y).toFixed(2)}`);
    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
  }, [peaks, start, clipEnd, duration]);
  if (!shape) return null;
  const progress = Math.max(0, Math.min(1, (currentTime - start) / (clipEnd - start)));
  const offset = `${progress * 100}%`;
  return <svg className="audio-waveform" viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" x2="100" y1="0" y2="0">
      <stop offset={offset} className="wave-played" />
      <stop offset={offset} className="wave-unplayed" />
    </linearGradient></defs>
    <line className="wave-baseline" x1="0" x2="100" y1="24" y2="24" />
    <path d={shape} fill={`url(#${gradient})`} />
    {progress > 0 && <line className="wave-playhead" x1={offset} x2={offset} y1="0" y2="48" />}
  </svg>;
}
