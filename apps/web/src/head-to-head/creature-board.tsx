import { CREATURE_MAX_HP, type HeadToHeadMove, type HeadToHeadView } from '@party/contracts';
import { defineTexts, useTexts } from '../i18n/texts.js';

export const CREATURE_TEXTS = defineTexts('creature-duel', {
  teamSize: 'Creatures per side', solo: 'One creature', team: 'Team of three', moves: 'Available moves',
  jab: 'Jab · 4 damage', surge: 'Surge · 6 damage', crush: 'Crush · 8 damage',
  guard: 'Guard · halve the next hit', mend: 'Mend · restore 5 HP', switch: 'Switch to {name}',
  guarding: 'Guarding', fallen: 'Knocked out',
}, {
  nl: { teamSize: 'Wezens per kant', solo: 'Eén wezen', team: 'Team van drie', moves: 'Beschikbare zetten', jab: 'Stoot · 4 schade', surge: 'Golf · 6 schade', crush: 'Verpletter · 8 schade', guard: 'Verdedig · halveer de volgende klap', mend: 'Herstel · krijg 5 HP terug', switch: 'Wissel naar {name}', guarding: 'Verdedigt', fallen: 'Uitgeschakeld' },
  de: { teamSize: 'Kreaturen pro Seite', solo: 'Eine Kreatur', team: 'Dreierteam', moves: 'Verfügbare Züge', jab: 'Stoß · 4 Schaden', surge: 'Welle · 6 Schaden', crush: 'Zermalmen · 8 Schaden', guard: 'Block · halbiere den nächsten Treffer', mend: 'Heilung · stelle 5 LP wieder her', switch: 'Zu {name} wechseln', guarding: 'Blockt', fallen: 'Kampfunfähig' },
  ro: { teamSize: 'Creaturi de fiecare parte', solo: 'O creatură', team: 'Echipă de trei', moves: 'Mișcări disponibile', jab: 'Lovitură · 4 daune', surge: 'Val · 6 daune', crush: 'Zdrobire · 8 daune', guard: 'Apără · înjumătățește următoarea lovitură', mend: 'Vindecă · recuperează 5 PV', switch: 'Schimbă cu {name}', guarding: 'Se apără', fallen: 'Eliminată' },
});

export const CREATURE_NAMES = {
  emberwing: 'Emberwing', reedrunner: 'Reedrunner', stormshell: 'Stormshell',
  moonmoth: 'Moonmoth', stonehorn: 'Stonehorn', brambletail: 'Brambletail',
} as const;
const ICONS = { emberwing: '🔥', reedrunner: '🌿', stormshell: '🌩️', moonmoth: '🌙', stonehorn: '🪨', brambletail: '🌵' } as const;
type Board = Extract<HeadToHeadView['board'], { game: 'creature-duel' }>;

export function CreatureBoard({ view, board, names, canMove, onMove }: { view: HeadToHeadView; board: Board; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void }) {
  const t = useTexts(CREATURE_TEXTS);
  const myTurn = canMove && view.seat === view.turn;
  return <div className="creature-battle">
    <div className="creature-teams">{([0, 1] as const).map(seat => <section key={seat} aria-label={names[seat]}>
      <h4>{names[seat]}</h4>
      {board.teams[seat].map((creature, index) => {
        const active = board.active[seat] === index;
        const name = CREATURE_NAMES[creature.kind];
        return <div className={`creature-card${active ? ' active' : ''}`} key={creature.kind}>
          <span aria-hidden="true">{ICONS[creature.kind]}</span><strong>{name}</strong>
          <meter aria-label={name} min={0} max={CREATURE_MAX_HP} value={creature.hp} />
          <small>{creature.hp} / {CREATURE_MAX_HP}{!creature.hp ? ` · ${t('fallen')}` : active && board.guards[seat] ? ` · ${t('guarding')}` : ''}</small>
          {myTurn && view.seat === seat && !active && creature.hp > 0 && <button type="button" className="small-button"
            onClick={() => onMove({ game: 'creature-duel', pick: index })}>{t('switch', { name })}</button>}
        </div>;
      })}
    </section>)}</div>
    {myTurn && <div className="actions creature-moves" role="group" aria-label={t('moves')}>{board.moves.map(pick =>
      <button type="button" key={pick} onClick={() => onMove({ game: 'creature-duel', pick })}>{t(pick)}</button>)}</div>}
  </div>;
}
