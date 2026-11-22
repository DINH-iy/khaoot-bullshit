import type { PoolImpactKind } from '@party/contracts';
import { activeSoundContext } from '../../room-extras/celebrate.js';
import ball from './audio/ball.wav?no-inline';
import cushion from './audio/cushion.wav?no-inline';

const recordings = { ball, cushion };
const files = new Map<PoolImpactKind, Promise<ArrayBuffer>>();
const buffers = new WeakMap<AudioContext, Map<PoolImpactKind, Promise<AudioBuffer>>>();

function loadRecording(kind: PoolImpactKind) {
  let file = files.get(kind);
  if (!file) {
    file = fetch(recordings[kind]).then(response => {
      if (!response.ok) throw new Error('Could not load pool sound');
      return response.arrayBuffer();
    });
    files.set(kind, file);
    void file.catch(() => { files.delete(kind); });
  }
  return file;
}

export function preloadPoolSounds() {
  void loadRecording('ball');
  void loadRecording('cushion');
}

export function playPoolImpact(kind: PoolImpactKind, strength: number) {
  const audio = activeSoundContext();
  if (!audio) return;
  const samples = buffers.get(audio) ?? new Map<PoolImpactKind, Promise<AudioBuffer>>();
  buffers.set(audio, samples);
  let sample = samples.get(kind);
  if (!sample) {
    sample = loadRecording(kind).then(bytes => audio.decodeAudioData(bytes.slice(0)));
    samples.set(kind, sample);
  }
  const at = audio.currentTime;
  void sample.then(buffer => {
    if (audio.currentTime - at > .1 || activeSoundContext() !== audio) return;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    source.playbackRate.value = .96 + Math.random() * .08;
    gain.gain.value = (kind === 'ball' ? .46 : .36) * Math.sqrt(strength / 100);
    source.connect(gain).connect(audio.destination);
    source.start();
  }).catch(() => { samples.delete(kind); });
}
