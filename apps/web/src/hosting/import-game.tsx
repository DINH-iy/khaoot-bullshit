import { useState } from 'react';
import { DraftSchema } from '@party/contracts';
import guide from '../../../../docs/guides/importing-games.md?raw';
import { newId, roomApi } from '../room/api.js';
import { useTexts } from '../i18n/texts.js';
import { rich } from '../i18n/rich.js';
import { HOSTING_TEXTS } from './hosting.text.js';

// The instructions an AI needs: the marked section of the guide, so the app and the guide never disagree.
export const aiInstructions = (() => {
  const start = guide.indexOf('<!-- ai-instructions:start -->'); const end = guide.indexOf('<!-- ai-instructions:end -->');
  return guide.slice(start + '<!-- ai-instructions:start -->'.length, end).replace(/^\s*## Instructions for the AI\s*/, '').trim();
})();

/** Create a game from pasted text, for example a game an AI wrote from the copied instructions. */
export function ImportGame() {
  const t = useTexts(HOSTING_TEXTS);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard.writeText(aiInstructions).then(() => setCopied(true), () => setMessage(t('copyBlocked'))); };
  const submit = () => {
    setBusy(true); setMessage('');
    void roomApi('/api/host/games/import', { gameId: newId(), text }).then(data => location.assign(`/?edit=${DraftSchema.parse(data).gameId}`))
      .catch(cause => setMessage(cause instanceof Error && cause.message === 'INVALID_COMMAND'
        ? t('notJson') : t('importFailed'))).finally(() => setBusy(false));
  };
  return <section aria-labelledby="import-heading"><h2 id="import-heading">{t('importHeading')}</h2>
    <p>{t('importIntro')}</p>
    <ol className="steps">
      <li>{rich(t('step1'), { copy: <strong>{t('copyInstructions')}</strong> })}</li>
      <li>{t('step2')}</li>
      <li>{rich(t('step3'), { import: <strong>{t('import')}</strong> })}</li>
      <li>{t('step4')}</li>
      <li>{rich(t('step5'), { rehearse: <strong>{t('rehearse')}</strong>, publish: <strong>{t('publish')}</strong> })}</li>
    </ol>
    <p>{rich(t('importNeeds'), { export: <strong>{t('exportAsText')}</strong> })}</p>
    <div className="actions"><button onClick={copy}>{t(copied ? 'instructionsCopied' : 'copyInstructions')}</button></div>
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <label>{t('gameText')}<textarea className="import-text" value={text} onChange={event => setText(event.target.value)} placeholder={'{ "title": "Quiz night", "scenes": [ … ] }'} spellCheck={false} /></label>
      {message && <p role="alert" className="error">{message}</p>}
      <button disabled={busy || text.trim().length < 2}>{t(busy ? 'importing' : 'import')}</button>
    </form>
    <details className="guide"><summary>{t('fullGuide')}</summary><pre>{guide.replace(/<!-- ai-instructions:(start|end) -->\n?/g, '')}</pre></details>
  </section>;
}
