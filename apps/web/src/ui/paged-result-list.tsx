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
    {total > 1 && <div className="result-page-actions">
      <button type="button" aria-label={t('previous')} disabled={shown === 0} onClick={() => setPage(shown - 1)}>←</button>
      <span role="status">{t('page', { current: shown + 1, total })}</span>
      <button type="button" aria-label={t('next')} disabled={shown + 1 >= total} onClick={() => setPage(shown + 1)}>→</button>
    </div>}
  </>;
}
