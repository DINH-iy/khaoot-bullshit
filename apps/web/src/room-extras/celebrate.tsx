import { useEffect, useRef, useState } from 'react';

const SOUND_KEY = 'party_sound';
export const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
export const setSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* only a convenience */ } };

let audio: AudioContext | null = null;
/** Phones only allow sound after a tap: the first tap anywhere prepares it. */
export function unlockSound() { try { audio ??= new AudioContext(); if (audio.state === 'suspended') void audio.resume(); } catch { audio = null; } }
/** A short rising chime, made on the phone (no sound files): bigger wins ring a little longer. */
export function playChime(strength: number) {
  if (!soundOn() || !audio || audio.state !== 'running') return;
  const notes = [523.25, 659.25, 783.99, 1046.5].slice(0, strength > 1 ? 4 : 3); const start = audio.currentTime;
  notes.forEach((frequency, index) => {
    const oscillator = audio!.createOscillator(); const gain = audio!.createGain(); const at = start + index * 0.08;
    oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    oscillator.connect(gain).connect(audio!.destination); oscillator.start(at); oscillator.stop(at + 0.5);
  });
}

/**
 * "+10" with confetti and a chime when this player's points for a round are
 * shown. Once per round. Players who ask for less motion get the number
 * without confetti; the sound follows the phone's sound setting in the dock.
 */
export function PointsCelebration({ roundId, points, label }: { roundId: string | null; points: number | null; label: string }) {
  const [shown, setShown] = useState<{ round: string; points: number } | null>(null); const done = useRef(new Set<string>());
  useEffect(() => {
    if (!roundId || !points || points <= 0 || done.current.has(roundId)) return;
    done.current.add(roundId); setShown({ round: roundId, points }); playChime(points >= 10 ? 2 : 1);
    if ('vibrate' in navigator) navigator.vibrate?.([30, 40, 60]);
    const timer = setTimeout(() => setShown(null), 2600); return () => clearTimeout(timer);
  }, [roundId, points]);
  if (!shown) return null;
  return <div className="celebration" aria-hidden="true">
    <div className="confetti">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--x': `${(index * 37) % 100}%`, '--delay': `${(index % 7) * 60}ms`, '--hue': `${(index * 47) % 360}` } as React.CSSProperties} />)}</div>
    <p className="celebration-points">+{label}</p>
  </div>;
}
