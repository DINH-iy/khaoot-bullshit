import { activeSoundContext } from '../../room-extras/celebrate.js';

let click: AudioBuffer | undefined;

export function playPoolImpact(strength: number) {
  const audio = activeSoundContext();
  if (!audio) return;
  if (!click || click.sampleRate !== audio.sampleRate) {
    click = audio.createBuffer(1, Math.ceil(audio.sampleRate * .045), audio.sampleRate);
    const samples = click.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      const time = index / audio.sampleRate;
      const body = Math.sin(2 * Math.PI * 940 * time) + .45 * Math.sin(2 * Math.PI * 2300 * time);
      samples[index] = .55 * body * Math.exp(-time * 245) + .25 * (Math.random() * 2 - 1) * Math.exp(-time * 650);
    }
  }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = click;
  gain.gain.value = .26 * Math.sqrt(strength / 100);
  source.connect(gain).connect(audio.destination);
  source.start();
}
