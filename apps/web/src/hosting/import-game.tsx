import { useState } from 'react';
import { DraftSchema } from '@party/contracts';
import guide from '../../../../docs/guides/importing-games.md?raw';
import { newId, roomApi } from '../network/api.js';

// The instructions an AI needs: the marked section of the guide, so the app and the guide never disagree.
export const aiInstructions = (() => {
  const start = guide.indexOf('<!-- ai-instructions:start -->'); const end = guide.indexOf('<!-- ai-instructions:end -->');
  return guide.slice(start + '<!-- ai-instructions:start -->'.length, end).replace(/^\s*## Instructions for the AI\s*/, '').trim();
})();

/** Create a game from pasted text, for example a game an AI wrote from the copied instructions. */
export function ImportGame() {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard.writeText(aiInstructions).then(() => setCopied(true), () => setMessage('Copying is blocked in this browser. Open “The full guide” below and copy the instructions from there.')); };
  const submit = () => {
    setBusy(true); setMessage('');
    void roomApi('/api/host/games/import', { gameId: newId(), text }).then(data => location.assign(`/?edit=${DraftSchema.parse(data).gameId}`))
      .catch(cause => setMessage(cause instanceof Error && cause.message === 'INVALID_COMMAND'
        ? 'This is not a game in JSON. Ask the AI to answer with only the JSON object, then paste it again.'
        : 'Importing did not work. Check the server is running and try again.')).finally(() => setBusy(false));
  };
  return <section aria-labelledby="import-heading"><h2 id="import-heading">Import a game from text</h2>
    <p>Make a whole game in one go, for example with an AI assistant such as Claude or ChatGPT:</p>
    <ol className="steps">
      <li>Press <strong>Copy instructions for an AI</strong> and paste them into the AI chat.</li>
      <li>Underneath, describe your game: the theme, how long, how many players, which kinds of rounds (quiz, jokes, pictures, voting, challenges, a party choice between routes, teams…).</li>
      <li>Copy the AI’s whole answer, paste it below and press <strong>Import</strong>. The editor opens with your game as a draft.</li>
      <li>Check it there. Any problem is explained on the scene it concerns; fix it in the editor, or paste the problems back to the AI and import its corrected answer.</li>
      <li><strong>Rehearse</strong> to try it, then <strong>Publish</strong> to play.</li>
    </ol>
    <p>What is needed: text in JSON with a title and a list of scenes. Everything else has a sensible default: scenes play in the order listed, quiz questions get 20 seconds and 10 points, writing rounds 60 seconds, party choices let everyone vote. A game with mistakes is still imported, with its problems listed; only text that is not JSON is refused. You can also write the text yourself, or paste a game made with <strong>Export as text</strong>.</p>
    <div className="actions"><button onClick={copy}>{copied ? 'Instructions copied ✓' : 'Copy instructions for an AI'}</button></div>
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <label>Game text<textarea className="import-text" value={text} onChange={event => setText(event.target.value)} placeholder={'{ "title": "Quiz night", "scenes": [ … ] }'} spellCheck={false} /></label>
      {message && <p role="alert" className="error">{message}</p>}
      <button disabled={busy || text.trim().length < 2}>{busy ? 'Importing…' : 'Import'}</button>
    </form>
    <details className="guide"><summary>The full guide: every scene type, team settings and an example</summary><pre>{guide.replace(/<!-- ai-instructions:(start|end) -->\n?/g, '')}</pre></details>
  </section>;
}
