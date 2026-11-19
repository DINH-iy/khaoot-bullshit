import { defineTexts } from '../i18n/texts.js';

export const ROUND_CONTROL_TEXTS = defineTexts('roundControls', {
  hostPhone: 'Host phone', none: 'None', hostPhoneFailed: 'Could not update the host phone.',
  controls: 'Host controls', autoReveal: 'Automatically reveal results', delay: 'Reveal delay in seconds', autoHelp: '0 reveals as soon as results are ready.',
  cards: 'Result cards', together: 'Show together', manual: 'One at a time, host advances', timed: 'One at a time, timed', interval: 'Seconds per card', nextCard: 'Next result', cardNumber: '{current} of {total}',
  voting: 'Ballot type', single: 'One choice', multi: 'Multiple choices', ranked: 'Rank choices', limit: 'Maximum selections', ranking: 'Rank choices in order. Select a choice again to remove it.',
  birthday: 'Private birthday vote', sing: 'Vote to sing Happy Birthday', unsing: 'Withdraw birthday vote', birthdayReady: 'Most players voted yes. Time to sing Happy Birthday!',
  birthdayFailed: "Could not save your vote.",
  countdown: 'Countdown before play (seconds)',
}, {
  nl: {
    hostPhone: 'Hosttelefoon', none: 'Geen', hostPhoneFailed: 'Hosttelefoon instellen is mislukt.',
    controls: 'Hostbediening', autoReveal: 'Toon resultaten automatisch', delay: 'Vertraging in seconden', autoHelp: 'Bij 0 verschijnen resultaten zodra ze klaar zijn.',
    cards: 'Resultaatkaarten', together: 'Alles tegelijk', manual: 'Eén voor één, host gaat verder', timed: 'Eén voor één, op tijd', interval: 'Seconden per kaart', nextCard: 'Volgend resultaat', cardNumber: '{current} van {total}',
    voting: 'Stemtype', single: 'Eén keuze', multi: 'Meerdere keuzes', ranked: 'Rangschik keuzes', limit: 'Maximaal aantal keuzes', ranking: 'Kies op volgorde. Selecteer een keuze opnieuw om deze te verwijderen.',
    birthday: 'Geheime verjaardagsstemming', sing: 'Stem om Lang zal ze leven te zingen', unsing: 'Trek je verjaardagsstem in', birthdayReady: 'De meerderheid stemde voor. Tijd om te zingen!',
    birthdayFailed: "Je stem kon niet worden opgeslagen.",
    countdown: 'Aftellen voor het spelen (seconden)',
  },
  de: {
    hostPhone: 'Host-Handy', none: 'Keins', hostPhoneFailed: 'Das Host-Handy konnte nicht geändert werden.',
    controls: 'Host-Steuerung', autoReveal: 'Ergebnisse automatisch zeigen', delay: 'Verzögerung in Sekunden', autoHelp: 'Bei 0 erscheinen Ergebnisse, sobald sie bereit sind.',
    cards: 'Ergebniskarten', together: 'Zusammen anzeigen', manual: 'Einzeln, Host schaltet weiter', timed: 'Einzeln, mit Timer', interval: 'Sekunden pro Karte', nextCard: 'Nächstes Ergebnis', cardNumber: '{current} von {total}',
    voting: 'Abstimmungsart', single: 'Eine Wahl', multi: 'Mehrere Optionen', ranked: 'Rangfolge', limit: 'Maximale Auswahl', ranking: 'Wähle in der gewünschten Reihenfolge. Erneutes Wählen entfernt eine Option.',
    birthday: 'Geheime Geburtstagsabstimmung', sing: 'Für ein Geburtstagslied abstimmen', unsing: 'Geburtstagsstimme zurückziehen', birthdayReady: 'Die Mehrheit hat zugestimmt. Zeit für ein Geburtstagslied!',
    birthdayFailed: "Deine Stimme konnte nicht gespeichert werden.",
    countdown: 'Countdown vor Spielbeginn (Sekunden)',
  },
  ro: {
    hostPhone: 'Telefonul gazdei', none: 'Niciunul', hostPhoneFailed: 'Telefonul gazdei nu a putut fi schimbat.',
    controls: 'Comenzile gazdei', autoReveal: 'Arată automat rezultatele', delay: 'Întârziere în secunde', autoHelp: 'La 0 rezultatele apar imediat ce sunt gata.',
    cards: 'Cartonașe cu rezultate', together: 'Arată simultan', manual: 'Pe rând, controlate de gazdă', timed: 'Pe rând, cu temporizator', interval: 'Secunde pe cartonaș', nextCard: 'Următorul rezultat', cardNumber: '{current} din {total}',
    voting: 'Tipul votului', single: 'O alegere', multi: 'Alegeri multiple', ranked: 'Clasament', limit: 'Numărul maxim de alegeri', ranking: 'Alege în ordine. Selectează din nou o opțiune pentru a o elimina.',
    birthday: 'Vot secret pentru aniversare', sing: 'Votează să cântăm La mulți ani', unsing: 'Retrage votul pentru aniversare', birthdayReady: 'Majoritatea a votat da. E timpul să cântăm!',
    birthdayFailed: "Votul nu a putut fi salvat.",
    countdown: 'Numărătoare inversă înainte de joc (secunde)',
  },
});
