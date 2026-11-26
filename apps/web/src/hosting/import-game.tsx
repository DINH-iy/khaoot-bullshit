import { useState } from 'react';
import { DraftSchema } from '@party/contracts';
import guide from '../../../../docs/guides/importing-games.md?raw';
import { newId, roomApi } from '../room/api.js';
import { useTexts } from '../i18n/texts.js';
import { rich } from '../i18n/rich.js';
import { HOSTING_TEXTS } from './hosting.text.js';
import { Icon } from '../editor/controls/icons.js';

// The instructions an AI needs: the marked section of the guide, so the app and the guide never disagree.
export const aiInstructions = (() => {
  const start = guide.indexOf('<!-- ai-instructions:start -->'); const end = guide.indexOf('<!-- ai-instructions:end -->');
  return guide.slice(start + '<!-- ai-instructions:start -->'.length, end).replace(/^\s*## Instructions for the AI\s*/, '').trim();
})();

/** Create a game from pasted text, for example a game an AI wrote from the copied instructions. */
export function ImportGame() {
  const t = useTexts(HOSTING_TEXTS);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const copy = () => { void navigator.clipboard.writeText(aiInstructions).then(() => setCopied(true), () => setMessage(t('copyBlocked'))); };
  const submit = () => {
    setBusy(true); setMessage('');
    void roomApi('/api/host/games/import', { gameId: newId(), text }).then(data => location.assign(`/?edit=${DraftSchema.parse(data).gameId}`))
      .catch(cause => setMessage(cause instanceof Error && cause.message === 'INVALID_COMMAND'
        ? t('notJson') : t('importFailed'))).finally(() => setBusy(false));
  };
  // Shown in the host menu's Import dialog, which carries the heading.
  return <div className="import-game">
    <p>{t('importIntro')}</p>
    <ol className="steps">
      <li>{rich(t('step1'), { copy: <strong>{t('copyInstructions')}</strong> })}</li>
      <li>{t('step2')}</li>
      <li>{rich(t('step3'), { import: <strong>{t('import')}</strong> })}</li>
      <li>{t('step4')}</li>
      <li>{rich(t('step5'), { rehearse: <strong>{t('rehearse')}</strong>, publish: <strong>{t('publish')}</strong> })}</li>
    </ol>
    <p className="hint">{rich(t('importNeeds'), { export: <strong>{t('exportAsText')}</strong> })}</p>
    <div className="actions"><button type="button" onClick={copy}>{t(copied ? 'instructionsCopied' : 'copyInstructions')}</button></div>
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <label>{t('gameText')}<textarea className="import-text" value={text} onChange={event => setText(event.target.value)} placeholder={'{ "title": "Quiz night", "scenes": [ … ] }'} spellCheck={false} /></label>
      {message && <p role="alert" className="error">{message}</p>}
      <button className="primary" disabled={busy || text.trim().length < 2}>{t(busy ? 'importing' : 'import')}</button>
    </form>
    {/* The whole guide, behind a labelled toggle (no browser disclosure triangle). */}
    <button type="button" className="guide-toggle" aria-expanded={guideOpen} onClick={() => setGuideOpen(!guideOpen)}><Icon name={guideOpen ? 'fold-all' : 'unfold-all'} size={18} /> {t('fullGuide')}</button>
    {guideOpen && <pre className="guide">{guide.replace(/<!-- ai-instructions:(start|end) -->\n?/g, '')}</pre>}
  </div>;
}
