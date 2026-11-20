import { defineTexts } from '../i18n/texts.js';

export const CHAT_TEXTS = defineTexts('room-chat', {
  title: 'Chat', show: 'Show on final scoreboard', enable: 'Allow player chat', room: 'Room', team: 'Team', private: 'Private',
  to: 'Recipient', message: 'Message', send: 'Send', report: 'Report', reported: 'Reported to the host',
  muted: 'The host has muted you.', mute: 'Mute in chat', unmute: 'Unmute in chat', moderate: 'Chat moderation',
  empty: 'No messages yet.', failure: 'Chat request failed. Try again in a moment.',
  retention: 'The last 100 messages are available for up to 30 minutes. Reports share the selected message with the host.',
}, {
  nl: { title: 'Chat', show: 'Toon op het eindklassement', enable: 'Sta chat tussen spelers toe', room: 'Kamer', team: 'Team', private: 'Privé', to: 'Ontvanger', message: 'Bericht', send: 'Verstuur', report: 'Meld', reported: 'Gemeld bij de presentator', muted: 'De presentator heeft je gedempt.', mute: 'Demp in chat', unmute: 'Hef demping op', moderate: 'Chatbeheer', empty: 'Er zijn nog geen berichten.', failure: 'Chatverzoek mislukt. Probeer het zo opnieuw.', retention: 'De laatste 100 berichten blijven maximaal 30 minuten beschikbaar. Bij een melding krijgt de presentator het geselecteerde bericht te zien.' },
  de: { title: 'Chat', show: 'In der Endwertung zeigen', enable: 'Spielerchat erlauben', room: 'Raum', team: 'Team', private: 'Privat', to: 'Empfänger', message: 'Nachricht', send: 'Senden', report: 'Melden', reported: 'Dem Host gemeldet', muted: 'Der Host hat dich stummgeschaltet.', mute: 'Im Chat stummschalten', unmute: 'Stummschaltung aufheben', moderate: 'Chat-Moderation', empty: 'Noch keine Nachrichten.', failure: 'Die Chat-Anfrage ist fehlgeschlagen. Versuche es gleich noch einmal.', retention: 'Die letzten 100 Nachrichten sind bis zu 30 Minuten sichtbar. Bei einer Meldung sieht der Host die ausgewählte Nachricht.' },
  ro: { title: 'Chat', show: 'Arată în clasamentul final', enable: 'Permite conversațiile dintre jucători', room: 'Cameră', team: 'Echipă', private: 'Privat', to: 'Destinatar', message: 'Mesaj', send: 'Trimite', report: 'Raportează', reported: 'Raportat gazdei', muted: 'Gazda ți-a blocat mesajele.', mute: 'Blochează în chat', unmute: 'Deblochează în chat', moderate: 'Moderare chat', empty: 'Încă nu sunt mesaje.', failure: 'Cererea de chat a eșuat. Încearcă din nou peste puțin timp.', retention: 'Ultimele 100 de mesaje sunt disponibile până la 30 de minute. Dacă raportezi un mesaj, gazda îl va vedea.' },
});
