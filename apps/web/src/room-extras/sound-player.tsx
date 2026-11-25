import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { playSound } from './sounds.js';
import { SOUND_TEXTS } from './sounds.text.js';

/** Plays each soundboard sound once on this screen, and names who played it for a moment. */
export function SoundPlayer({ state, event }: { state: RoomSnapshot; event: { id: number; playerId: string; sound: number } | null }) {
  const s = useTexts(SOUND_TEXTS); const played = useRef(0); const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!event || event.id <= played.current) return;
    played.current = event.id;
    const sound = state.view.party?.sounds[event.sound]; if (!sound || state.settings.soundboard === false) return;
    playSound(sound);
    const name = state.players.find(player => player.id === event.playerId)?.displayName ?? '';
    setShown(s('played', { name, sound: sound.kind === 'builtin' ? s(sound.name) : sound.label }));
  }, [event, state, s]);
  // The note goes after 3 seconds; its own timer, so room updates in between do not keep it up.
  useEffect(() => { if (!shown) return; const timer = setTimeout(() => setShown(null), 3000); return () => clearTimeout(timer); }, [shown]);
  return shown ? <p className="sound-toast" role="status">{shown}</p> : null;
}
