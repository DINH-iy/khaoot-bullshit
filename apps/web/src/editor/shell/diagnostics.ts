import type { DefinitionIssue } from '@party/contracts';
import type { Language } from '../../i18n/language.js';

const rules: Record<string, [string, string, string]> = {
  'Clap the beat needs at least 9 seconds': ['Klap op de maat heeft minstens 9 seconden nodig.', 'Klatsch im Takt braucht mindestens 9 Sekunden.', 'Bate ritmul are nevoie de cel puțin 9 secunde.'],
  'Unreachable node': ['Verbind deze scène met de rest van het spel of verwijder haar.', 'Verbinde diese Szene mit dem Spiel oder lösche sie.', 'Conectează scena la joc sau șterge-o.'],
  'Unconnected route option': ['Een routeoptie is nog niet verbonden.', 'Eine Routenoption ist noch nicht verbunden.', 'O opțiune de traseu nu este încă legată.'],
  'Unknown route option': ['Een verbinding gebruikt een verwijderde routeoptie.', 'Eine Verbindung nutzt eine gelöschte Routenoption.', 'O legătură folosește o opțiune de traseu ștearsă.'],
  'Duplicate route option': ['Een routeoptie heeft meerdere verbindingen.', 'Eine Routenoption hat mehrere Verbindungen.', 'O opțiune de traseu are mai multe legături.'],
  'Route options must lead to different scenes': ['Geef iedere routeoptie een eigen bestemming.', 'Gib jeder Routenoption ein eigenes Ziel.', 'Dă fiecărei opțiuni de traseu o destinație proprie.'],
  'Route choice must be its own node': ['Een routekeuze moet een aparte scène zijn.', 'Eine Routenwahl braucht eine eigene Szene.', 'Alegerea traseului trebuie să fie o scenă separată.'],
  'Only route choices branch': ['Alleen een routekeuze mag naar meerdere scènes leiden.', 'Nur eine Routenwahl darf zu mehreren Szenen führen.', 'Doar alegerea traseului poate duce la mai multe scene.'],
  'Branching requires a later definition format': ['Voeg een routekeuze toe om vertakkingen in te schakelen.', 'Füge eine Routenwahl hinzu, um Verzweigungen zu aktivieren.', 'Adaugă o alegere de traseu pentru a activa ramificarea.'],
  'Route choices require format 2': ['Dit spelformaat ondersteunt geen routekeuzes.', 'Dieses Spielformat unterstützt keine Routenwahl.', 'Acest format de joc nu acceptă alegeri de traseu.'],
  'Cycle or invalid route': ['Een route loopt in een cirkel. Verbind de scènes vooruit.', 'Eine Route läuft im Kreis. Verbinde die Szenen vorwärts.', 'Un traseu formează un ciclu. Leagă scenele în ordine.'],
  'Self connection': ['Een scène is met zichzelf verbonden.', 'Eine Szene ist mit sich selbst verbunden.', 'O scenă este legată de ea însăși.'],
  'Duplicate connection': ['Twee verbindingen hebben dezelfde scènes.', 'Zwei Verbindungen verbinden dieselben Szenen.', 'Două legături unesc aceleași scene.'],
  'Invalid default route': ['Controleer de standaardroute.', 'Prüfe die Standardroute.', 'Verifică traseul implicit.'],
  'Host route choice has no timer': ['Zet de timer uit als de presentator de route kiest.', 'Schalte den Timer aus, wenn der Host die Route wählt.', 'Oprește cronometrul când gazda alege traseul.'],
  'Invalid vote source': ['Kies op iedere route een eerdere schrijf- of uploadronde zonder punten als stembron.', 'Wähle auf jeder Route eine frühere Schreib- oder Uploadrunde ohne Punkte als Abstimmungsquelle.', 'Alege pe fiecare traseu o rundă anterioară de scris sau încărcare, fără puncte, ca sursă de vot.'],
  'Vote source may never be revealed': ['Op sommige routes wordt niet op deze antwoorden gestemd.', 'Auf manchen Routen wird über diese Antworten nie abgestimmt.', 'Pe unele trasee, aceste răspunsuri nu sunt supuse votului.'],
  'Game teams are used before they are defined': ['Voeg op elke route eerder een scène toe waarin je teams maakt.', 'Füge auf jeder Route vorher eine Szene zur Teambildung ein.', 'Adaugă mai devreme pe fiecare traseu o scenă de formare a echipelor.'],
  'Captain vote needs teams earlier on every path': ['Maak op elke route teams voordat de aanvoerders stemmen.', 'Bilde auf jeder Route Teams, bevor die Kapitäne abstimmen.', 'Formează echipe pe fiecare traseu înainte de votul căpitanilor.'],
  'Missing start node': ['Kies de scène waarmee het spel begint.', 'Wähle die Startszene des Spiels.', 'Alege scena cu care începe jocul.'],
  'Missing edge endpoint': ['Een verbinding wijst naar een verwijderde scène.', 'Eine Verbindung zeigt auf eine gelöschte Szene.', 'O legătură indică o scenă ștearsă.'],
  'Duplicate node key': ['Geef iedere scène een unieke naam.', 'Gib jeder Szene einen eigenen Namen.', 'Dă fiecărei scene un nume unic.'],
  'Duplicate stage key': ['Geef ieder onderdeel een unieke naam.', 'Gib jedem Teil einen eigenen Namen.', 'Dă fiecărei părți un nume unic.'],
  'Duplicate edge key': ['Geef iedere verbinding een unieke naam.', 'Gib jeder Verbindung einen eigenen Namen.', 'Dă fiecărei legături un nume unic.'],
  'Invalid correct choice': ['Kies het juiste antwoord uit de opties.', 'Wähle die richtige Antwort aus den Optionen.', 'Alege răspunsul corect dintre opțiuni.'],
  'Invalid correct order': ['Gebruik ieder item precies één keer in de juiste volgorde.', 'Verwende jedes Element genau einmal in der richtigen Reihenfolge.', 'Folosește fiecare element exact o dată în ordinea corectă.'],
  'Too many stages': ['Gebruik maximaal 200 rondes.', 'Verwende höchstens 200 Runden.', 'Folosește cel mult 200 de runde.'],
  'Too many route choices': ['Gebruik maximaal 20 routekeuzes.', 'Verwende höchstens 20 Routenwahlen.', 'Folosește cel mult 20 de alegeri de traseu.'],
  'Too many connections': ['Het spel heeft te veel verbindingen.', 'Das Spiel hat zu viele Verbindungen.', 'Jocul are prea multe legături.'],
  'Route options must be unique': ['Geef iedere routeoptie een unieke naam.', 'Gib jeder Routenoption einen eigenen Namen.', 'Dă fiecărei opțiuni de traseu un nume unic.'],
  'Give every team a unique name': ['Geef ieder team een unieke naam.', 'Gib jedem Team einen eigenen Namen.', 'Dă fiecărei echipe un nume unic.'],
  'Choice keys must be unique': ['Geef iedere antwoordoptie een unieke naam.', 'Gib jeder Antwortoption einen eigenen Namen.', 'Dă fiecărei opțiuni de răspuns un nume unic.'],
  'Item keys must be unique': ['Geef ieder item een unieke naam.', 'Gib jedem Element einen eigenen Namen.', 'Dă fiecărui element un nume unic.'],
  'At most one team takes the rest': ['Slechts één team mag de overgebleven spelers krijgen.', 'Nur ein Team darf die übrigen Personen aufnehmen.', 'Doar o echipă poate primi jucătorii rămași.'],
  'Choose a minigame': ['Kies een minigame voor deze scène.', 'Wähle ein Minispiel für diese Szene.', 'Alege un minijoc pentru această scenă.'],
  'This scene spins a wheel that does not exist': ['Kies een bestaand rad of zet het rad uit voor deze scène.', 'Wähle ein vorhandenes Rad oder schalte es für diese Szene aus.', 'Alege o roată existentă sau dezactiveaz-o pentru această scenă.'],
  'Duplicate wheel': ['Geef ieder rad een unieke naam.', 'Gib jedem Rad einen eigenen Namen.', 'Dă fiecărei roți un nume unic.'],
  'Wheel entries must be unique': ['Ieder vak op het rad moet uniek zijn.', 'Jeder Eintrag auf dem Rad muss eindeutig sein.', 'Fiecare opțiune de pe roată trebuie să fie unică.'],
  'This minigame needs teams': ['Deze minigame wordt in teams gespeeld.', 'Dieses Minispiel wird in Teams gespielt.', 'Acest minijoc se joacă în echipe.'],
  'Minigame settings are not valid': ['Controleer de tijden en punten van de minigame.', 'Prüfe Zeiten und Punkte des Minispiels.', 'Verifică timpii și punctele minijocului.'],
  'Duel game settings are not valid': ['Controleer de instellingen van het duel.', 'Prüfe die Einstellungen des Duells.', 'Verifică setările duelului.'],
  'An award is about a scene that does not exist': ['Kies een bestaande scène voor de prijs of verwijder de prijs.', 'Wähle eine vorhandene Szene für den Preis oder entferne ihn.', 'Alege o scenă existentă pentru premiu sau elimină-l.'],
  'Write the explanation for this scene, or switch it off': ['Schrijf de uitleg voor deze scène of zet haar uit.', 'Schreibe die Erklärung für diese Szene oder schalte sie aus.', 'Scrie explicația pentru această scenă sau dezactiveaz-o.'],
  'Give the minigame either points per place or places, not both': ['Stel de punten per plaats opnieuw in voor deze minigame.', 'Lege die Punkte pro Platz für dieses Minispiel erneut fest.', 'Configurează din nou punctele pe loc pentru acest minijoc.'],
};
rules['Scene names must be unique'] = rules['Duplicate node key']!;

export function localizeDiagnostics(issues: DefinitionIssue[], language: Language): DefinitionIssue[] {
  if (language === 'en') return issues;
  const index = { nl: 0, de: 1, ro: 2 } as const;
  const fallback = ['Controleer deze instelling', 'Prüfe diese Einstellung', 'Verifică această setare'][index[language]];
  return issues.map(issue => ({
    ...issue,
    message: Object.hasOwn(rules, issue.code)
      ? rules[issue.code]![index[language]]
      : `${fallback}${issue.path ? ` (${issue.path})` : ''}. ${issue.message}`,
  }));
}
