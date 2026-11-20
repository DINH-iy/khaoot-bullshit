import { defineTexts } from '../i18n/texts.js';

export const PHONE_FEEDBACK_TEXTS = defineTexts('phone-feedback', {
  title: 'Phone effects', enable: 'Let players choose phone effects before play', sound: 'Score sound',
  screen: 'Score effect', rumble: 'Vibration', chime: 'Chime', arcade: 'Arcade', bell: 'Bell',
  confetti: 'Confetti', glow: 'Glow', plain: 'Score only', preview: 'Preview sound',
  microphone: 'Microphone test', micStart: 'Start microphone test', micStop: 'Stop microphone test',
  micHint: 'The input level is measured on this phone. Audio stays on this device.',
  micFailed: 'Microphone access is unavailable or was denied.', inputLevel: 'Microphone level',
}, {
  nl: { title: 'Telefooneffecten', enable: 'Laat spelers vóór het spel telefooneffecten kiezen', sound: 'Scoregeluid', screen: 'Score-effect', rumble: 'Trillen', chime: 'Klank', arcade: 'Arcade', bell: 'Bel', confetti: 'Confetti', glow: 'Gloed', plain: 'Alleen de score', preview: 'Beluister geluid', microphone: 'Microfoontest', micStart: 'Start microfoontest', micStop: 'Stop microfoontest', micHint: 'Deze telefoon meet het invoerniveau. Audio blijft op dit apparaat.', micFailed: 'De microfoon is niet beschikbaar of toegang is geweigerd.', inputLevel: 'Microfoonniveau' },
  de: { title: 'Handyeffekte', enable: 'Spieler dürfen vor Spielbeginn Handyeffekte wählen', sound: 'Punkteton', screen: 'Punkteeffekt', rumble: 'Vibration', chime: 'Klang', arcade: 'Arcade', bell: 'Glocke', confetti: 'Konfetti', glow: 'Leuchten', plain: 'Nur Punkte', preview: 'Ton anhören', microphone: 'Mikrofontest', micStart: 'Mikrofontest starten', micStop: 'Mikrofontest stoppen', micHint: 'Dieses Handy misst den Eingangspegel. Der Ton bleibt auf diesem Gerät.', micFailed: 'Das Mikrofon ist nicht verfügbar oder der Zugriff wurde verweigert.', inputLevel: 'Mikrofonpegel' },
  ro: { title: 'Efecte pe telefon', enable: 'Jucătorii pot alege efectele telefonului înainte de joc', sound: 'Sunet de punctaj', screen: 'Efect de punctaj', rumble: 'Vibrații', chime: 'Clopoței', arcade: 'Arcade', bell: 'Clopot', confetti: 'Confetti', glow: 'Strălucire', plain: 'Doar punctajul', preview: 'Ascultă sunetul', microphone: 'Test microfon', micStart: 'Pornește testul de microfon', micStop: 'Oprește testul de microfon', micHint: 'Acest telefon măsoară nivelul de intrare. Sunetul rămâne pe acest dispozitiv.', micFailed: 'Microfonul nu este disponibil sau accesul a fost refuzat.', inputLevel: 'Nivelul microfonului' },
});
