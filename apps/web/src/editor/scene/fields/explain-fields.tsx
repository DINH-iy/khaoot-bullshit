import { howToPlayKey, isMinigameKey, TEXT_DEFAULTS } from '@party/contracts';
import type { Definition, Stage } from '../../model.js';

/**
 * Explain the round first: everyone sees a text before the round starts, players tap “Got it”,
 * and the host starts the round. A minigame may leave the text empty: then it shows the game's
 * standard “how to play” (Look & feel → Texts → Minigames).
 */
export function ExplainFields({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const explain = stage['explain'] as { text?: string } | undefined;
  const game = stage.kind === 'minigame' && typeof stage['game'] === 'string' && isMinigameKey(stage['game']) ? stage['game'] : null;
  const texts = (definition['presentation'] as { texts?: Record<string, string> } | undefined)?.texts ?? {};
  const standard = game ? texts[howToPlayKey(game)] ?? TEXT_DEFAULTS[howToPlayKey(game)] : null;
  const without = () => { const { explain: _explain, ...rest } = stage; return rest as Stage; };
  return <>
    <label className="choice"><input type="checkbox" checked={Boolean(explain)} onChange={event => onChange(event.target.checked ? { ...stage, explain: {} } : without(), 'explain')} />
      Explain the round first</label>
    {explain && <>
      <label>Explanation
        <textarea rows={4} maxLength={1000} value={explain.text ?? ''} placeholder={standard ?? 'How this round works, in a few sentences.'}
          onChange={event => onChange({ ...stage, explain: event.target.value ? { text: event.target.value } : {} }, 'explain-text')} /></label>
      <p className="hint">Everyone sees this before the round starts; players tap <em>Got it!</em> and you start the round when everyone is ready.
        {game ? ' Left empty: the standard explanation of this minigame, shown in grey (change it for the whole game in Look & feel → Texts → Minigames).' : ''}</p>
      {!game && !explain.text?.trim() && <p className="hint warn">Write the explanation, or switch it off.</p>}
    </>}
  </>;
}
