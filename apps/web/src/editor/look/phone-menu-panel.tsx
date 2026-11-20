import { PHONE_MENU_ACTIONS, PHONE_MENU_GLYPHS, PhoneMenuGlyphSchema, type PhoneMenuIcons } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { PhoneMenuIcon } from '../../room-extras/phone-menu-icon.js';
import { Dropdown } from '../../ui/dropdown.js';

const TEXTS = defineTexts('phone-menu-editor', {
  standard: 'Default', scores: 'Scoreboard', players: 'Players', chat: 'Chat', react: 'React', break: 'Break', games: 'Games',
  challenge: 'Challenge', sound: 'Sound', effects: 'Settings', birthday: 'Birthday vote', leave: 'Leave room', language: 'Language',
  scoreboard: 'Trophy', teams: 'People', smile: 'Smile', pause: 'Pause', minigame: 'Controller', duel: 'Crossed swords',
  slots: 'Slot machine', blackjack: 'Blackjack', roulette: 'Red or Black Roulette', coinGame: 'Heads or Tails', packs: 'Packs', leaderboard: 'Chip leaderboard', reels: 'Reels', cards: 'Cards', coin: 'Coin', gift: 'Gift box', bars: 'Bar chart',
  phone: 'Phone', gear: 'Gear', cake: 'Cake', exit: 'Exit', globe: 'Globe', star: 'Star', sparkles: 'Sparkles', flag: 'Flag', wheel: 'Wheel', heart: 'Heart',
}, {
  nl: {
    standard: 'Standaard', scores: 'Scorebord', players: 'Spelers', chat: 'Chat', react: 'Reageren', break: 'Pauze', games: 'Spellen',
    challenge: 'Uitdagen', sound: 'Geluid', effects: 'Instellingen', birthday: 'Verjaardagsstem', leave: 'Kamer verlaten', language: 'Taal',
    scoreboard: 'Trofee', teams: 'Mensen', smile: 'Glimlach', pause: 'Pauze', minigame: 'Controller', duel: 'Gekruiste zwaarden',
    slots: 'Gokkast', blackjack: 'Blackjack', roulette: 'Rood of zwart roulette', coinGame: 'Kop of munt', packs: 'Pakjes', leaderboard: 'Fichesklassement', reels: 'Rollen', cards: 'Kaarten', coin: 'Munt', gift: 'Cadeaudoos', bars: 'Staafdiagram',
    phone: 'Telefoon', gear: 'Tandwiel', cake: 'Taart', exit: 'Uitgang', globe: 'Wereldbol', star: 'Ster', sparkles: 'Schittering', flag: 'Vlag', wheel: 'Wiel', heart: 'Hart',
  },
  de: {
    standard: 'Standard', scores: 'Punktestand', players: 'Spieler', chat: 'Chat', react: 'Reagieren', break: 'Pause', games: 'Spiele',
    challenge: 'Herausforderung', sound: 'Ton', effects: 'Einstellungen', birthday: 'Geburtstagsabstimmung', leave: 'Raum verlassen', language: 'Sprache',
    scoreboard: 'Pokal', teams: 'Personen', smile: 'Lächeln', pause: 'Pause', minigame: 'Controller', duel: 'Gekreuzte Schwerter',
    slots: 'Spielautomat', blackjack: 'Blackjack', roulette: 'Rot oder Schwarz Roulette', coinGame: 'Kopf oder Zahl', packs: 'Packs', leaderboard: 'Chip-Rangliste', reels: 'Walzen', cards: 'Karten', coin: 'Münze', gift: 'Geschenk', bars: 'Balkendiagramm',
    phone: 'Handy', gear: 'Zahnrad', cake: 'Kuchen', exit: 'Ausgang', globe: 'Globus', star: 'Stern', sparkles: 'Funkeln', flag: 'Flagge', wheel: 'Rad', heart: 'Herz',
  },
  ro: {
    standard: 'Implicit', scores: 'Clasament', players: 'Jucători', chat: 'Chat', react: 'Reacționează', break: 'Pauză', games: 'Jocuri',
    challenge: 'Provocare', sound: 'Sunet', effects: 'Setări', birthday: 'Vot de ziua de naștere', leave: 'Părăsește camera', language: 'Limbă',
    scoreboard: 'Trofeu', teams: 'Persoane', smile: 'Zâmbet', pause: 'Pauză', minigame: 'Controler', duel: 'Săbii încrucișate',
    slots: 'Păcănele', blackjack: 'Blackjack', roulette: 'Ruletă roșu sau negru', coinGame: 'Cap sau pajură', packs: 'Pachete', leaderboard: 'Clasamentul jetoanelor', reels: 'Role', cards: 'Cărți', coin: 'Monedă', gift: 'Cadou', bars: 'Diagramă cu bare',
    phone: 'Telefon', gear: 'Roată dințată', cake: 'Tort', exit: 'Ieșire', globe: 'Glob', star: 'Stea', sparkles: 'Scântei', flag: 'Steag', wheel: 'Roată', heart: 'Inimă',
  },
});

export function PhoneMenuPanel({ icons, onChange }: { icons?: PhoneMenuIcons | undefined; onChange: (icons: PhoneMenuIcons) => void }) {
  const t = useTexts(TEXTS);
  const options = [{ value: 'default', label: t('standard') }, ...PHONE_MENU_GLYPHS.map(value => ({ value, label: t(value) }))];
  return <div className="phone-menu-editor">
    {PHONE_MENU_ACTIONS.map(action => <label key={action}>
      <PhoneMenuIcon action={action} icons={icons} /><span>{t(action === 'coin' ? 'coinGame' : action)}</span>
      <Dropdown value={icons?.[action] ?? 'default'} options={options} label={t(action === 'coin' ? 'coinGame' : action)} onChange={value => {
        const next = { ...icons };
        const glyph = PhoneMenuGlyphSchema.safeParse(value);
        if (glyph.success) next[action] = glyph.data;
        else delete next[action];
        onChange(next);
      }} />
    </label>)}
  </div>;
}
