import { useTexts } from '../../i18n/texts.js';
import { useText } from '../../presentation/look.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { useServerNow } from './clock.js';

export interface Result { value: number; early?: true; stroke?: number[]; graphLine?: number[]; teamId?: string }
export interface ControllerProps<S> { settings: S; startsAt: string; goAt: string | null; offset: number; disabled: boolean; onResult: (result: Result) => void }

/** "3, 2, 1" until play starts, the same moment on every phone. Renders children once it has. */
export function Countdown({ startsAt, offset, children }: { startsAt: string | undefined; offset: number; children: React.ReactNode }) {
  const t = useText(); const c = useTexts(CONTROL_TEXTS); const now = useServerNow(offset, Boolean(startsAt)); const left = startsAt ? Date.parse(startsAt) - now : 0;
  if (left > 0) return <div className="mg-countdown" role="timer" aria-label={c('starts')}><span>{t('minigame.getReady')}</span><strong key={Math.ceil(left / 1000)}>{Math.ceil(left / 1000)}</strong></div>;
  return <>{children}</>;
}

