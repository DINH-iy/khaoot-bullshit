import { useCallback, useEffect, useRef, useState } from 'react';
import { SavePointListSchema, SavePointSchema, SavePointSummarySchema, type SavePointSummary } from '@party/contracts';
import { newId, roomApi } from '../../room/api.js';
import { useTexts } from '../../i18n/texts.js';
import { useLanguage } from '../../i18n/language.js';
import { ConfirmDialog } from '../controls/confirm-dialog.js';
import { Icon } from '../controls/icons.js';
import { fromDoc, type Doc } from '../live/document.js';
import type { DraftState } from './use-draft.js';
import { SAVE_POINT_TEXTS } from './save-points.text.js';

type Message = { text: string; error: boolean } | null;
const errorCode = (cause: unknown) => cause instanceof Error ? cause.message : '';

/**
 * Save points: copies of the whole game kept on the server, made on purpose, to go back to "in case something
 * happens". The server copies the saved draft, so a save point is only made once every change is saved. Going back
 * first keeps what the game is now as an automatic save point, then puts the copy in as one ordinary edit: saved,
 * shared with the other editors, and undone with Undo. The published version stays as it is.
 */
export function SavePointsPanel({ gameId, d, onClose }: { gameId: string; d: DraftState; onClose: () => void }) {
  const t = useTexts(SAVE_POINT_TEXTS); const language = useLanguage();
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => { heading.current?.focus(); }, []);
  const [list, setList] = useState<{ savePoints: SavePointSummary[]; limit: number }>(); const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState(''); const [requestId, setRequestId] = useState(newId);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState<{ kind: 'back' | 'remove'; point: SavePointSummary } | null>(null);
  const load = useCallback(() => {
    setLoadFailed(false);
    void roomApi(`/api/host/games/${gameId}/save-points`).then(data => setList(SavePointListSchema.parse(data)), () => setLoadFailed(true));
  }, [gameId]);
  useEffect(load, [load]);
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const waiting = d.save !== 'saved'; const locked = d.readOnly || waiting || busy;
  const failure = (cause: unknown, fallback: Parameters<typeof t>[0]) => {
    const code = errorCode(cause);
    return { text: code === 'SAVE_POINT_LIMIT' ? t('full', { limit: list?.limit ?? 0 }) : code === 'REVISION_CONFLICT' ? t('changed') : t(fallback), error: true };
  };
  /** Makes a save point of the draft as it is saved now (the revision this editor last saw). */
  const make = (pointName: string, id: string, automatic = false) => roomApi(`/api/host/games/${gameId}/save-points`,
    { savePointId: id, name: pointName.trim().slice(0, 80), expectedRevision: d.draft?.revision ?? 0, ...(automatic ? { automatic: true } : {}) }).then(data => SavePointSummarySchema.parse(data));

  const save = (event: React.FormEvent) => {
    event.preventDefault(); if (locked || !name.trim()) return;
    setBusy(true); setMessage(null);
    void make(name, requestId).then(made => { setMessage({ text: t('made', { name: made.name }), error: false }); setName(''); setRequestId(newId()); load(); },
      cause => setMessage(failure(cause, 'failed'))).finally(() => setBusy(false));
  };
  const goBack = (point: SavePointSummary) => {
    setBusy(true); setMessage(null);
    const before = t('before', { name: point.name }).slice(0, 80);
    // Nothing changes until both the copy of now and the save point's content are in hand.
    void Promise.all([make(before, newId(), true), roomApi(`/api/host/games/${gameId}/save-points/${point.id}`).then(data => SavePointSchema.parse(data))])
      .then(([kept, chosen]) => {
        const { definition, positions } = fromDoc(chosen.definition as Doc);
        d.change(definition, positions);
        setMessage({ text: t('back', { name: point.name, before: kept.name }), error: false }); load();
      }, cause => setMessage(failure(cause, 'backFailed'))).finally(() => setBusy(false));
  };
  const remove = (point: SavePointSummary) => {
    setBusy(true); setMessage(null);
    void roomApi(`/api/host/games/${gameId}/save-points/${point.id}/delete`, {}).then(load, cause => setMessage(failure(cause, 'removeFailed'))).finally(() => setBusy(false));
  };

  const points = list?.savePoints ?? [];
  return <section className="game-settings-panel save-points-panel" aria-labelledby="save-points-heading" onKeyDown={event => { if (event.key === 'Escape' && !confirming) onClose(); }}>
    <div className="inspector-head"><h2 id="save-points-heading" ref={heading} tabIndex={-1}>{t('title')}</h2><button className="small-button" onClick={onClose}>{t('close')}</button></div>
    <p className="hint">{t('intro')}</p>
    <form className="save-point-form" onSubmit={save}>
      <label>{t('name')}<input value={name} maxLength={80} placeholder={t('placeholder')} disabled={d.readOnly} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="accent" disabled={locked || !name.trim()}><Icon name="save" size={18} />{t(busy ? 'saving' : 'save')}</button>
      {d.readOnly ? <p className="hint">{t('viewing')}</p> : waiting && <p className="hint" role="status">{t('waitSaving')}</p>}
    </form>
    {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'hint warn' : 'hint'}>{message.text}</p>}
    {loadFailed ? <div className="save-point-empty"><p role="alert" className="hint warn">{t('loadFailed')}</p><button type="button" className="small-button" onClick={load}><Icon name="restart" size={16} />{t('retry')}</button></div>
      : !list ? <p role="status" className="hint">{t('loading')}</p>
      : !points.length ? <p className="hint save-point-empty">{t('empty')}</p>
      : <>
        <p className="hint save-point-count">{t('count', { count: points.length, limit: list.limit })}</p>
        <ul className="plain-list save-point-list">{points.map(point => <li key={point.id} className={`save-point${point.automatic ? ' automatic' : ''}`}>
          <span className="save-point-text"><strong>{point.name}</strong>
            <small><time dateTime={point.createdAt}>{when.format(new Date(point.createdAt))}</time> · {t(point.sceneCount === 1 ? 'sceneOne' : 'sceneMany', { count: point.sceneCount })} · {point.automatic ? t('automatic') : point.savedBy ? t('by', { name: point.savedBy }) : t('byYou')}</small></span>
          <span className="save-point-actions">
            <button type="button" className="small-button" disabled={locked} aria-label={t('goBackLabel', { name: point.name })} title={t('goBackLabel', { name: point.name })} onClick={() => setConfirming({ kind: 'back', point })}><Icon name="undo" size={16} />{t('goBack')}</button>
            <button type="button" className="small-button icon-only danger-icon" disabled={busy || d.readOnly} aria-label={t('removeLabel', { name: point.name })} title={t('removeLabel', { name: point.name })} onClick={() => setConfirming({ kind: 'remove', point })}><Icon name="trash" size={16} /></button>
          </span>
        </li>)}</ul>
      </>}
    {confirming && (confirming.kind === 'back'
      ? <ConfirmDialog title={t('confirmBackTitle', { name: confirming.point.name })} text={t('confirmBackText')} confirm={t('confirmBack')} onCancel={() => setConfirming(null)} onConfirm={() => { const { point } = confirming; setConfirming(null); goBack(point); }} />
      : <ConfirmDialog title={t('confirmRemoveTitle', { name: confirming.point.name })} text={t('confirmRemoveText')} confirm={t('confirmRemove')} onCancel={() => setConfirming(null)} onConfirm={() => { const { point } = confirming; setConfirming(null); remove(point); }} />)}
  </section>;
}
