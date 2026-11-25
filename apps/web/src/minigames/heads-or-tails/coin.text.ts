import { defineTexts } from '../../i18n/texts.js';

export const COIN_TEXTS = defineTexts('coin', {
  heads: 'Heads', tails: 'Tails', landed: 'It landed on {side}', right: 'Correct guess', wrong: 'Wrong guess',
  picks: 'Secret guesses', noStake: 'Free', evenMoney: 'Win the same number of chips you stake and get your stake back.',
  retry: 'Retry flip', flipNow: 'Flip the coin', waitFlip: 'Your guess is locked in. The host flips the coin.',
}, {
  nl: {
    heads: 'Kop', tails: 'Munt', landed: 'De munt viel op {side}', right: 'Goed geraden', wrong: 'Fout geraden',
    picks: 'Geheime keuzes', noStake: 'Gratis', evenMoney: 'Win evenveel fiches als je inzet en krijg je inzet terug.',
    retry: 'Opnieuw proberen', flipNow: 'De munt opgooien', waitFlip: 'Je keuze staat vast. De host gooit de munt op.',
  },
  de: {
    heads: 'Kopf', tails: 'Zahl', landed: 'Die Münze zeigt {side}', right: 'Richtig geraten', wrong: 'Falsch geraten',
    picks: 'Geheime Tipps', noStake: 'Gratis', evenMoney: 'Gewinne so viele Chips wie du einsetzt und erhalte deinen Einsatz zurück.',
    retry: 'Wurf erneut versuchen', flipNow: 'Die Münze werfen', waitFlip: 'Dein Tipp steht. Der Host wirft die Münze.',
  },
  ro: {
    heads: 'Cap', tails: 'Pajură', landed: 'Moneda a căzut pe {side}', right: 'Ai ghicit', wrong: 'Ai ghicit greșit',
    picks: 'Alegeri secrete', noStake: 'Gratis', evenMoney: 'Câștigi tot atâtea jetoane cât ai mizat și îți primești miza înapoi.',
    retry: 'Reîncearcă aruncarea', flipNow: 'Aruncă moneda', waitFlip: 'Alegerea ta e blocată. Gazda aruncă moneda.',
  },
});
