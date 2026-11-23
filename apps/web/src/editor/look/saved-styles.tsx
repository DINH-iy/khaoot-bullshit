import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SavedStyleListSchema, SavedStyleSchema, type SavedStyle, type Theme } from '@party/contracts';
import { newId, roomApi } from '../../room/api.js';
import { useTexts } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';

// Saved styles (contracts/styles.ts): the owner's and editors' own styles, next to the built-in ones.

/** A look layer written the same way every time, to tell whether a look is exactly a style. */
function canonical(theme: Theme | undefined): string {
  const tidy = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(tidy);
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).filter(([, inner]) => inner !== undefined).map(([key, inner]) => [key, tidy(inner)] as const)
        .filter(([key, inner]) => !(key === 'colors' && inner && typeof inner === 'object' && !Object.keys(inner).length));
      return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  };
  return JSON.stringify(tidy(theme ?? {}));
}
export const sameLook = (a: Theme | undefined, b: Theme | undefined) => canonical(a) === canonical(b);

/** The shared list of saved styles: loaded once, saved with a short delay while someone keeps changing one. */
export function useSavedStyles() {
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  const [error, setError] = useState<'stylesFailed' | 'styleSaveFailed' | 'styleLimit' | 'styleRemoveFailed' | ''>('');
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let active = true;
    void roomApi('/api/host/styles').then(result => { if (active) setStyles(SavedStyleListSchema.parse(result)); })
      .catch(() => { if (active) setError('stylesFailed'); });
    const pending = timers.current;
    return () => { active = false; for (const timer of pending.values()) clearTimeout(timer); };
  }, []);

  const send = useCallback(async (style: Pick<SavedStyle, 'id' | 'name' | 'theme'>) => {
    try {
      const saved = SavedStyleSchema.parse(await roomApi('/api/host/styles', { styleId: style.id, name: style.name, theme: style.theme }));
      setError('');
      return saved;
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'STYLE_LIMIT' ? 'styleLimit' : 'styleSaveFailed');
      throw cause;
    }
  }, []);

  /** Shows the style straight away (so the look still matches it) and saves it; `later` waits for a pause in the changes. */
  const save = useCallback((style: Pick<SavedStyle, 'id' | 'name' | 'theme'>, later = false) => {
    setStyles(previous => {
      const entry = { ...style, updatedAt: new Date().toISOString() };
      return previous.some(item => item.id === style.id) ? previous.map(item => item.id === style.id ? entry : item) : [...previous, entry];
    });
    clearTimeout(timers.current.get(style.id));
    if (!later) return send(style).then(() => undefined, () => undefined);
    timers.current.set(style.id, setTimeout(() => { timers.current.delete(style.id); void send(style).catch(() => undefined); }, 600));
    return Promise.resolve();
  }, [send]);

  const create = useCallback(async (name: string, theme: Theme) => {
    const style = { id: newId(), name, theme };
    try { await send(style); } catch { return null; }
    setStyles(previous => [...previous, { ...style, updatedAt: new Date().toISOString() }]);
    return style.id;
  }, [send]);

  const remove = useCallback(async (id: string) => {
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    try {
      await roomApi(`/api/host/styles/${id}/delete`, {});
    } catch (cause) {
      if (!(cause instanceof Error && cause.message === 'NOT_FOUND')) { setError('styleRemoveFailed'); return false; }
    }
    setStyles(previous => previous.filter(style => style.id !== id)); setError('');
    return true;
  }, []);

  return { styles, error, save, create, remove };
}

/**
 * Asked at the first change to a look that is exactly a style: make a new style from it,
 * update the saved style (own styles only), or change only this game. Cancel drops the change.
 */
export function StyleChangeDialog({ styleName, own, busy, error, onCreate, onUpdate, onOnlyHere, onCancel }: {
  styleName: string; own: boolean; busy: boolean; error: string; onCreate: (name: string) => void; onUpdate: () => void; onOnlyHere: () => void; onCancel: () => void;
}) {
  const t = useTexts(LOOK_TEXTS); const id = useId();
  const [name, setName] = useState(() => t('styleCopyName', { name: styleName }).slice(0, 60));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; input.current?.select(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="ed-dialog style-change-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}
      onSubmit={event => { event.preventDefault(); if (name.trim() && !busy) onCreate(name.trim()); }}>
      <h2 id={`${id}-title`}>{t('styleChangeTitle', { name: styleName })}</h2>
      <p id={`${id}-text`}>{t(own ? 'styleChangeOwnText' : 'styleChangeText')}</p>
      <label>{t('styleName')}<input ref={input} value={name} maxLength={60} required onChange={event => setName(event.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="style-change-actions">
        <button type="submit" className="primary" disabled={busy || !name.trim()}>{t(busy ? 'styleSaving' : 'styleCreate')}</button>
        {own && <button type="button" disabled={busy} onClick={onUpdate}>{t('styleUpdate', { name: styleName })}</button>}
        <button type="button" disabled={busy} onClick={onOnlyHere}>{t('styleOnlyHere')}</button>
        <button type="button" onClick={onCancel}>{t('styleCancel')}</button>
      </div>
    </form>
  </div>;
}

/** "Save as new style": names the current look and adds it to the saved styles. */
export function NewStyleDialog({ defaultName, busy, error, onSave, onCancel }: { defaultName: string; busy: boolean; error: string; onSave: (name: string) => void; onCancel: () => void }) {
  const t = useTexts(LOOK_TEXTS); const id = useId();
  const [name, setName] = useState(defaultName.slice(0, 60)); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; input.current?.select(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="ed-dialog style-change-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}
      onSubmit={event => { event.preventDefault(); if (name.trim() && !busy) onSave(name.trim()); }}>
      <h2 id={`${id}-title`}>{t('styleNewTitle')}</h2>
      <p>{t('styleNewText')}</p>
      <label>{t('styleName')}<input ref={input} value={name} maxLength={60} required onChange={event => setName(event.target.value)} /></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="style-change-actions">
        <button type="submit" className="primary" disabled={busy || !name.trim()}>{t(busy ? 'styleSaving' : 'styleCreate')}</button>
        <button type="button" onClick={onCancel}>{t('styleCancel')}</button>
      </div>
    </form>
  </div>;
}
