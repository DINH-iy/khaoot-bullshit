export const SOUND_EFFECTS = ['chime', 'arcade', 'bell'] as const;
export const SCREEN_EFFECTS = ['confetti', 'glow', 'plain'] as const;
export type SoundEffect = typeof SOUND_EFFECTS[number];
export type ScreenEffect = typeof SCREEN_EFFECTS[number];

function preference<T extends string>(setting: string, values: readonly T[]): T {
  try {
    const saved = localStorage.getItem(`party-phone-${setting}`);
    return values.find(value => value === saved) ?? values[0]!;
  } catch { return values[0]!; }
}

export function setPhoneFeedback(setting: 'sound' | 'screen' | 'rumble', value: string) {
  try { localStorage.setItem(`party-phone-${setting}`, value); } catch { /* Storage can be disabled. */ }
}

export const soundEffect = () => preference('sound', SOUND_EFFECTS);
export const screenEffect = () => preference('screen', SCREEN_EFFECTS);
export const rumbleOn = () => preference('rumble', ['on', 'off']) === 'on';
export const rumbleAvailable = () => typeof navigator.vibrate === 'function';
export function rumble(pattern: number | number[]) {
  if (!rumbleAvailable()) return;
  if (rumbleOn()) navigator.vibrate(pattern);
}
