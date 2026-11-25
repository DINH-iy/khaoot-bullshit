import { SOUND_MAX_SECONDS, type BuiltinSound, type Sound } from '@party/contracts';
import { activeSoundContext, unlockSound } from './celebrate.js';

// The soundboard's sounds on the screen that plays them. Built-in sounds are made here with the Web Audio
// API (no files); a game's own sounds are songs from its media library, cut off after SOUND_MAX_SECONDS.

type Note = { at: number; frequency: number; length: number; type?: OscillatorType; to?: number | undefined; volume?: number };

function tone(audio: AudioContext, start: number, note: Note) {
  const oscillator = audio.createOscillator(); const gain = audio.createGain(); const at = start + note.at; const volume = note.volume ?? 0.2;
  oscillator.type = note.type ?? 'triangle'; oscillator.frequency.setValueAtTime(note.frequency, at);
  if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, at + note.length);
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.setValueAtTime(volume, at + Math.max(0.03, note.length - 0.08)); gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
  oscillator.connect(gain).connect(audio.destination); oscillator.start(at); oscillator.stop(at + note.length + 0.02);
}
/** Noise shaped by a gain envelope: a drum hit, a crash, applause. */
function noise(audio: AudioContext, start: number, at: number, length: number, volume: number, filter = 2000) {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate); const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  const source = audio.createBufferSource(); const gain = audio.createGain(); const pass = audio.createBiquadFilter();
  pass.type = 'bandpass'; pass.frequency.value = filter; source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start + at); gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
  source.connect(pass).connect(gain).connect(audio.destination); source.start(start + at);
}

const SYNTH: Record<BuiltinSound, (audio: AudioContext, start: number) => void> = {
  fanfare: (audio, start) => [[0, 523.25, 0.14], [0.15, 523.25, 0.14], [0.3, 523.25, 0.14], [0.45, 659.25, 0.5], [0.95, 587.33, 0.16], [1.12, 659.25, 0.16], [1.29, 783.99, 0.8]]
    .forEach(([at, frequency, length]) => tone(audio, start, { at: at!, frequency: frequency!, length: length!, type: 'sawtooth', volume: 0.12 })),
  tada: (audio, start) => { for (const frequency of [523.25, 659.25, 783.99]) tone(audio, start, { at: 0, frequency, length: 0.12 }); for (const frequency of [587.33, 739.99, 880, 1174.66]) tone(audio, start, { at: 0.16, frequency, length: 0.9, volume: 0.14 }); },
  ding: (audio, start) => { tone(audio, start, { at: 0, frequency: 1318.51, length: 1.2, type: 'sine', volume: 0.3 }); tone(audio, start, { at: 0, frequency: 2637, length: 0.6, type: 'sine', volume: 0.08 }); },
  airhorn: (audio, start) => [0, 0.3, 0.6].forEach((at, index) => { for (const frequency of [466, 470]) tone(audio, start, { at, frequency, length: index === 2 ? 0.9 : 0.24, type: 'sawtooth', volume: 0.1 }); }),
  drumroll: (audio, start) => { for (let hit = 0; hit < 30; hit++) noise(audio, start, hit * 0.05, 0.06, 0.25 + hit * 0.01, 900); noise(audio, start, 1.55, 1.2, 0.5, 5000); },
  boing: (audio, start) => { tone(audio, start, { at: 0, frequency: 180, to: 620, length: 0.25, type: 'sine', volume: 0.3 }); tone(audio, start, { at: 0.25, frequency: 620, to: 140, length: 0.5, type: 'sine', volume: 0.3 }); },
  'sad-trombone': (audio, start) => [[0, 392], [0.45, 369.99], [0.9, 349.23], [1.35, 329.63]]
    .forEach(([at, frequency], index) => tone(audio, start, { at: at!, frequency: frequency!, to: index === 3 ? frequency! * 0.94 : undefined, length: index === 3 ? 1.2 : 0.42, type: 'sawtooth', volume: 0.12 })),
  applause: (audio, start) => { for (let clap = 0; clap < 60; clap++) noise(audio, start, clap * 0.04 + Math.random() * 0.03, 0.05, 0.15 + Math.random() * 0.2, 1500 + Math.random() * 1500); },
};

let playing: HTMLAudioElement | null = null;
/** Plays a sound here. Returns false when this browser does not allow sound yet (no tap on the page so far). */
export function playSound(sound: Sound): boolean {
  if (sound.kind === 'media') {
    playing?.pause();
    const element = new Audio(`/api/media/${sound.id}`); playing = element;
    const stop = setTimeout(() => element.pause(), SOUND_MAX_SECONDS * 1000);
    element.addEventListener('ended', () => clearTimeout(stop));
    void element.play().catch(() => clearTimeout(stop));
    return true;
  }
  unlockSound();
  const audio = activeSoundContext(); if (!audio) return false;
  SYNTH[sound.name](audio, audio.currentTime + 0.02);
  return true;
}
