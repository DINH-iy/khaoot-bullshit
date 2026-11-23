import { useState, type ReactNode } from 'react';
import { defineTexts, useTexts } from '../i18n/texts.js';

const TEXTS = defineTexts('result pages', {
  previous: 'Previous page', next: 'Next page', page: '{current} of {total}',
}, {
  nl: { previous: 'Vorige pagina', next: 'Volgende pagina', page: '{current} van {total}' },
  de: { previous: 'Vorherige Seite', next: 'Nächste Seite', page: '{current} von {total}' },
  ro: { previous: 'Pagina anterioară', next: 'Pagina următoare', page: '{current} din {total}' },
});

export function PagedResultList({ rows, className, pageSize, ordered = false }: {
  rows: ReactNode[]; className: string; pageSize: number; ordered?: boolean;
}) {
  const t = useTexts(TEXTS);
  const [page, setPage] = useState(0);
  const total = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = Math.min(page, total - 1);
  const start = shown * pageSize;
  const items = rows.slice(start, start + pageSize);
  return <>
    {ordered ? <ol className={className} start={start + 1}>{items}</ol> : <ul className={className}>{items}</ul>}
    {total > 1 && <PageButtons page={shown} pages={total} onPage={setPage} label={t('page', { current: shown + 1, total })} />}
  </>;
}

/** Previous and next page around a label (page 2 of 5, or 51–100 of 1,113); nothing when everything fits on one page. */
export function PageButtons({ page, pages, onPage, label }: { page: number; pages: number; onPage: (page: number) => void; label: string }) {
  const t = useTexts(TEXTS);
  if (pages <= 1) return null;
  return <div className="result-page-actions">
    <button type="button" aria-label={t('previous')} title={t('previous')} disabled={page === 0} onClick={() => onPage(page - 1)}>←</button>
    <span role="status">{label}</span>
    <button type="button" aria-label={t('next')} title={t('next')} disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>→</button>
  </div>;
}
