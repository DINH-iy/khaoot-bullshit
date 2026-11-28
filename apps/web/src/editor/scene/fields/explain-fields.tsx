import { useState } from 'react';
import { howToPlayKey, isMinigameKey, pointsAtStake, sceneMediaUrl, TEXT_DEFAULTS, type SceneMedia, type StakePoints } from '@party/contracts';
import { translate } from '../../../i18n/texts.js';
import { marked } from '../../../i18n/rich.js';
import { formatPoints } from '../../../room/results.js';
import { Icon } from '../../controls/icons.js';
import { FIELDS_TEXTS } from '../fields.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import type { Definition, Stage } from '../../model.js';
import { MediaLibraryDialog } from './media-field.js';

type Intro = { text?: string; points?: boolean; picture?: SceneMedia; screenOnly?: boolean };

/** The points at stake in a few words, as the intro will show them. */
export function stakeSummary(points: StakePoints): string {
  if (points.kind === 'round') return t(points.upTo ? 'stakeUpTo' : 'stakeExact', { points: formatPoints(points.milli) });
  const parts = [Number(points.perVoteMilli) > 0 ? t('stakePerVote', { points: formatPoints(points.perVoteMilli) }) : '', points.bonusMilli ? t('stakeBonus', { points: formatPoints(points.bonusMilli) }) : ''];
  return parts.filter(Boolean).join(', ');
}

/**
 * The intro before a round: everyone sees it before the round starts, players tap “Got it”, and the host
 * starts the round. It can show a text, the points at stake (worked out from the scene's scoring, so it
 * follows changes to the points) and a picture; or only on the shared screen, with phones waiting.
 * A minigame may leave the text empty: then it shows the game's standard “how to play”
 * (Look & feel → Texts → Minigames). Switching it on shows the points of a round that earns them.
 */
export function ExplainFields({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const intro = stage['explain'] as Intro | undefined;
  const [choosing, setChoosing] = useState(false);
  const game = stage.kind === 'minigame' && typeof stage['game'] === 'string' && isMinigameKey(stage['game']) ? stage['game'] : null;
  const texts = (definition['presentation'] as { texts?: Record<string, string> } | undefined)?.texts ?? {};
  const standard = game ? texts[howToPlayKey(game)] ?? TEXT_DEFAULTS[howToPlayKey(game)] : null;
  const stake = pointsAtStake(stage);
  const without = () => { const { explain: _explain, ...rest } = stage; return rest as Stage; };
  const set = (change: { [K in keyof Intro]?: Intro[K] | undefined }, field: string) => {
    const next: Record<string, unknown> = { ...intro, ...change };
    for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === false || next[key] === '') delete next[key];
    onChange({ ...stage, explain: next }, field);
  };
  const empty = intro && !game && !intro.text?.trim() && !intro.picture && !(intro.points && stake);
  return <>
    <label className="choice"><input type="checkbox" checked={Boolean(intro)} onChange={event => onChange(event.target.checked ? { ...stage, explain: stake ? { points: true } : {} } : without(), 'explain')} />
      {t('explainFirst')}</label>
    {intro && <>
      <label className="choice"><input type="checkbox" checked={Boolean(intro.points)} disabled={!stake && !intro.points} onChange={event => set({ points: event.target.checked }, 'explain-points')} />
        {t('showPoints')}</label>
      {!stake && <p className="hint">{t('noStake')}</p>}
      <label>{t('explanation')}
        <textarea rows={4} maxLength={1000} value={intro.text ?? ''} placeholder={standard ?? t('explainPlaceholder')}
          onChange={event => set({ text: event.target.value }, 'explain-text')} /></label>
      <div className="intro-picture">
        <span className="intro-picture-label">{t('introPicture')}</span>
        {intro.picture ? <>
          <img src={sceneMediaUrl(intro.picture.id)} alt="" />
          <button type="button" className="small-button" onClick={() => setChoosing(true)}>{t('changePicture')}</button>
          <button type="button" className="icon-only danger-icon" aria-label={t('removePicture')} title={t('removePicture')} onClick={() => set({ picture: undefined }, 'explain-picture')}><Icon name="trash" size={14} /></button>
        </> : <button type="button" className="small-button with-icon" onClick={() => setChoosing(true)}><Icon name="plus" size={16} />{t('addPicture')}</button>}
      </div>
      <label className="choice"><input type="checkbox" checked={Boolean(intro.screenOnly)} onChange={event => set({ screenOnly: event.target.checked }, 'explain-screen')} />
        {t('screenOnly')}</label>
      <p className="hint">{marked(t(intro.screenOnly ? 'screenOnlyHint' : 'explainHint'))}{game ? t('explainGame') : ''}</p>
      {empty && <p className="hint warn">{t('writeIt')}</p>}
    </>}
    {choosing && <MediaLibraryDialog current={intro?.picture?.id} only="image" title={t('introPicture')} onPick={item => { set({ picture: { id: item.id, kind: 'image' } }, 'explain-picture'); setChoosing(false); }} onClose={() => setChoosing(false)} />}
  </>;
}
