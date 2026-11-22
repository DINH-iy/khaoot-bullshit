import { useEffect, useRef, useState } from 'react';
import { FONT_FILE_ACCEPT, FONT_FILE_MAX, FONTS, FontLibrarySchema, FontUploadResultSchema, type FontName, type FontUploadResult, type FullTheme, type Theme, type ThemeFont, type UploadedFont } from '@party/contracts';
import { translate, useTexts } from '../../i18n/texts.js';
import { fontCssFamily } from '../../presentation/theme-fonts.js';
import { roomApi } from '../../room/api.js';
import { Dropdown } from '../../ui/dropdown.js';
import { LOOK_TEXTS } from './look.text.js';

const LABELS = { system: 'fSystem', rounded: 'fRounded', serif: 'fSerif', slab: 'fSlab', mono: 'fMono', condensed: 'fCondensed', playful: 'fPlayful', elegant: 'fElegant' } as const;
const key = (font: ThemeFont) => typeof font === 'string' ? font : font.id;
export const fontLabel = (font: ThemeFont) => typeof font === 'string' ? translate(LOOK_TEXTS, LABELS[font]) : font.name;

async function uploadFont(file: File) {
  if (file.size > FONT_FILE_MAX) throw new Error('FILE_TOO_LARGE');
  if (typeof FontFace === 'function') {
    try { await new FontFace('party-font-upload', await file.arrayBuffer()).load(); }
    catch { throw new Error('UNSUPPORTED_MEDIA'); }
  }
  const response = await fetch(`/api/host/fonts?name=${encodeURIComponent(file.name)}`, {
    method: 'POST', credentials: 'same-origin', body: file,
    headers: { 'x-party-request': '1', 'content-type': 'application/octet-stream' },
    signal: AbortSignal.timeout(30000),
  });
  const reply = await response.json();
  if (!reply.ok) throw new Error(reply.error.code);
  return FontUploadResultSchema.parse(reply.data);
}

export function FontFields({ theme, full, inherited, onChange }: {
  theme: Theme; full: FullTheme; inherited?: FullTheme | undefined; onChange: (patch: Partial<Theme>) => void;
}) {
  const t = useTexts(LOOK_TEXTS);
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [googleUrl, setGoogleUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof LOOK_TEXTS.en | ''>('');
  const [added, setAdded] = useState<FontUploadResult>();
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void roomApi('/api/host/fonts').then(result => {
      if (!active) return;
      const listed = FontLibrarySchema.parse(result);
      setFonts(previous => [...new Map([...listed, ...previous].map(font => [font.id, font])).values()]);
    }).catch(() => { if (active) setError('fontLibraryFailed'); });
    return () => { active = false; };
  }, []);

  const add = async (load: () => Promise<FontUploadResult>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setAdded(undefined);
    try {
      const result = await load();
      const { id, name } = result;
      setFonts(previous => previous.some(font => font.id === id) ? previous : [...previous, { id, name }]);
      setAdded(result);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      const errors: Record<string, keyof typeof LOOK_TEXTS.en> = { FILE_TOO_LARGE: 'fontTooLarge', UNSUPPORTED_MEDIA: 'fontUnsupported', INVALID_COMMAND: 'fontGoogleLink',
        FONT_IMPORT_FAILED: 'fontImportFailed', STORAGE_FULL: 'fontStorageFull', RATE_LIMITED: 'fontBusy' };
      setError(errors[code] ?? 'fontAddFailed');
    } finally { setBusy(false); }
  };

  const selection = (role: 'font' | 'headingFont') => {
    const known = new Map(fonts.map(font => [font.id, font]));
    const current = full[role];
    if (typeof current !== 'string' && !known.has(current.id)) known.set(current.id, current);
    const values: ThemeFont[] = [...Object.keys(FONTS) as FontName[], ...known.values()];
    const options = values.map(font => ({ value: key(font), label: fontLabel(font),
      ...(typeof font === 'string' ? { style: { fontFamily: fontCssFamily(font) } } : {}) }));
    if (inherited) options.unshift({ value: 'inherit', label: t('fontInherited', { name: fontLabel(inherited[role]) }) });
    return <label>{t(role === 'font' ? 'font' : 'titleFont')}
      <Dropdown value={inherited && !theme[role] ? 'inherit' : key(current)} options={options}
        onChange={value => onChange({ [role]: values.find(font => key(font) === value) })} />
    </label>;
  };

  return <>
    {selection('font')}
    {selection('headingFont')}
    <input ref={file} type="file" aria-label={t('fontUpload')} accept={FONT_FILE_ACCEPT} hidden onChange={event => {
      const selected = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (selected) void add(() => uploadFont(selected));
    }} />
    <div className="palette-actions">
      <button type="button" className="small-button theme-font-upload" disabled={busy} onClick={() => file.current?.click()}>{t('fontUpload')}</button>
    </div>
    <p className="hint">{t('fontFormats')}</p>
    <form className="theme-font-import" onSubmit={event => {
      event.preventDefault();
      void add(async () => {
        const font = FontUploadResultSchema.parse(await roomApi('/api/host/fonts/google', { url: googleUrl }, 'POST', 15000));
        setGoogleUrl('');
        return font;
      });
    }}>
      <label>{t('fontGoogle')}<input type="url" value={googleUrl} placeholder="https://fonts.google.com/specimen/…"
        maxLength={2048} onChange={event => setGoogleUrl(event.target.value)} /></label>
      <button type="submit" className="small-button" disabled={busy || !googleUrl.trim()}>{t('fontImport')}</button>
    </form>
    {busy && <p role="status" className="hint">{t('fontAdding')}</p>}
    {added && <p role="status" className="hint">{t(added.alreadyPresent ? 'fontAlreadyPresent' : 'fontAdded', { name: added.name })}</p>}
    {error && <p role="alert" className="error">{t(error)}</p>}
  </>;
}
