import type { CSSProperties } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { poolBallColor } from './table.js';

const TEXTS = defineTexts('pool-pots', {
  pots: 'Potted balls', none: 'No pots yet', ball: 'Ball {number}',
}, {
  nl: { pots: 'Gepotte ballen', none: 'Nog geen ballen', ball: 'Bal {number}' },
  de: { pots: 'Versenkte Kugeln', none: 'Noch keine Kugeln', ball: 'Kugel {number}' },
  ro: { pots: 'Bile introduse', none: 'Nicio bilă', ball: 'Bila {number}' },
});

export function PotTrays({ names, pots, turn }: {
  names: [string, string]; pots: readonly [readonly number[], readonly number[]]; turn: number | null;
}) {
  const t = useTexts(TEXTS);
  return <div className="pool-pot-trays" role="group" aria-label={t('pots')}>
    {([0, 1] as const).map(seat => <div className="pool-pot-tray" data-turn={turn === seat} key={seat}>
      <strong>{names[seat]}</strong>
      <div className="pool-potted">
        {pots[seat].length ? pots[seat].map(id => <span key={id} className="pool-potted-ball" data-stripe={id > 8}
          aria-label={t('ball', { number: id })} role="img" style={{ '--ball-color': poolBallColor(id) } as CSSProperties}><span aria-hidden="true">{id}</span></span>)
          : <span className="pool-no-pots">{t('none')}</span>}
      </div>
    </div>)}
  </div>;
}
