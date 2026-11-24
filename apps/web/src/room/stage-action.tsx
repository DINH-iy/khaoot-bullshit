import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small place to the right of the round's title (the room screen provides it). A round's main
 * action, such as sending a drawing, goes there, so the round itself keeps the room below.
 */
export const StageActionSlot = createContext<HTMLElement | null>(null);
/** Shows its button next to the round's title when there is room for it there, and in place otherwise. */
export function StageAction({ children }: { children: ReactNode }) {
  const slot = useContext(StageActionSlot);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
