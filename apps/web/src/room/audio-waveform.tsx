import { useEffect, useState, type CSSProperties } from 'react';
import { LIBRARY_LIMITS } from '@party/contracts';

const BAR_COUNT = 64;
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
    const peaks = Array.from({ length: BAR_COUNT }, (_, bar) => {
      const start = Math.floor(bar * audio.length / BAR_COUNT);
      const end = Math.floor((bar + 1) * audio.length / BAR_COUNT);
      const step = Math.max(1, Math.floor((end - start) / 192));
      let peak = 0;
      for (const samples of channels) {
        for (let at = start; at < end; at += step) peak = Math.max(peak, Math.abs(samples[at]!));
      }
      return peak;
    });
    const max = Math.max(0.03, ...peaks);
    return peaks.map(peak => Math.max(.04, peak / max));
  }).catch(() => { peaksByFile.delete(url); return null; });
  peaksByFile.set(url, pending);
  return pending;
}

export function AudioWaveform({ url, duration, currentTime, start, end }: {
  url: string; duration: number; currentTime: number; start: number; end?: number | undefined;
}) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS) return;
    let live = true;
    void filePeaks(url).then(values => { if (live) setPeaks(values); });
    return () => { live = false; };
  }, [url, duration]);
  if (!peaks || duration <= 0) return null;
  const first = Math.floor(start / duration * peaks.length);
  const last = Math.min(peaks.length, Math.ceil((end ?? duration) / duration * peaks.length));
  return <div className="audio-waveform" aria-hidden="true">
    {peaks.slice(first, last).map((height, index) => <i key={index} className={currentTime >= (first + index + .5) / peaks.length * duration ? 'played' : undefined}
      style={{ '--wave-height': `${height * 100}%` } as CSSProperties} />)}
  </div>;
}
