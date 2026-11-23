import { defineTexts, useTexts } from '../i18n/texts.js';
import { PageButtons } from '../ui/paged-result-list.js';
import type { PeoplePaging } from './use-people-page.js';

const TEXTS = defineTexts('people pages', { range: '{from}–{to} of {total}' }, {
  nl: { range: '{from}–{to} van {total}' }, de: { range: '{from}–{to} von {total}' }, ro: { range: '{from}–{to} din {total}' },
});

/** Page buttons under a list of people: "51–100 of 1,113". */
export function PeoplePager({ paging }: { paging: PeoplePaging }) {
  const t = useTexts(TEXTS); const { data, page, pages, setPage } = paging;
  if (!data) return null;
  const from = page * data.pageSize + 1; const to = Math.min(data.total, from + data.people.length - 1);
  return <PageButtons page={page} pages={pages} onPage={setPage} label={t('range', { from: from.toLocaleString(), to: to.toLocaleString(), total: data.total.toLocaleString() })} />;
}
