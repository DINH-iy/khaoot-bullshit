import { defineTexts } from '../../i18n/texts.js';

// The editor's small shared controls: popups, the add-a-scene menu's prefabs, saving a prefab, the minimap, colours.
export const CONTROLS_TEXTS = defineTexts('editor-controls', {
  all: 'All', other: 'Other', sorts: 'Sorts', chosen: 'Chosen', cancel: 'Cancel', keep: 'Keep', choose: 'Choose…', addColour: 'Add a colour',
  prefabs: 'Prefabs', withPrefabs: '{label} · Prefabs', sceneSorts: 'Sorts of scenes', prefabsFailed: 'The prefabs could not be loaded. Try again.', prefabFailed: '“{name}” could not be loaded. Try again.',
  previousPage: 'Previous', nextPage: 'Next', pageCount: '{page} / {total}',
  minigameSorts: 'Minigame categories', back: 'Back',
  deletePrefabAsk: 'Delete the prefab “{name}”? Games it was inserted into keep their scenes.', deleteFailed: 'Deleting did not work. Try again.', loadingPrefabs: 'Loading prefabs…',
  noPrefabs: 'No prefabs yet. Select one or more scenes and press **Save as prefab**; they appear here for every game.', sceneOne: '1 scene', sceneMany: '{count} scenes', deletePrefab: 'Delete prefab {name}',
  saved: 'Saved as “{name}”. Find it under Add a scene, in the Prefabs tab.', limit: 'There are already 200 prefabs. Delete some first.', tooLarge: 'This is too large for a prefab. Select fewer scenes.',
  saveFailed: 'Saving did not work. Try again.', prefabName: 'Prefab name', saving: 'Saving…', savePrefab: 'Save prefab', saveAsPrefab: 'Save as prefab',
  minimap: 'Overview of the whole game. Click to move the view there.',
}, {
  nl: {
    all: 'Alles', other: 'Overig', sorts: 'Soorten', chosen: 'Gekozen', cancel: 'Annuleren', keep: 'Laten staan', choose: 'Kies…', addColour: 'Een kleur toevoegen',
    prefabs: 'Prefabs', withPrefabs: '{label} · Prefabs', sceneSorts: 'Soorten scènes', prefabsFailed: 'De prefabs konden niet geladen worden. Probeer het opnieuw.', prefabFailed: '“{name}” kon niet geladen worden. Probeer het opnieuw.',
    previousPage: 'Vorige', nextPage: 'Volgende', pageCount: '{page} / {total}',
    minigameSorts: 'Minigamecategorieën', back: 'Terug',
    deletePrefabAsk: 'De prefab “{name}” verwijderen? Spellen waarin hij is ingevoegd houden hun scènes.', deleteFailed: 'Verwijderen lukte niet. Probeer het opnieuw.', loadingPrefabs: 'Prefabs laden…',
    noPrefabs: 'Nog geen prefabs. Kies een of meer scènes en druk op **Opslaan als prefab**; ze verschijnen hier voor elk spel.', sceneOne: '1 scène', sceneMany: '{count} scènes', deletePrefab: 'Prefab {name} verwijderen',
    saved: 'Opgeslagen als “{name}”. Je vindt hem onder Een scène toevoegen, op het tabblad Prefabs.', limit: 'Er zijn al 200 prefabs. Verwijder er eerst een paar.', tooLarge: 'Dit is te groot voor een prefab. Kies minder scènes.',
    saveFailed: 'Opslaan lukte niet. Probeer het opnieuw.', prefabName: 'Naam van de prefab', saving: 'Opslaan…', savePrefab: 'Prefab opslaan', saveAsPrefab: 'Opslaan als prefab',
    minimap: 'Overzicht van het hele spel. Klik om het beeld daarheen te verplaatsen.',
  },
  de: {
    all: 'Alle', other: 'Sonstige', sorts: 'Arten', chosen: 'Gewählt', cancel: 'Abbrechen', keep: 'Behalten', choose: 'Wählen…', addColour: 'Eine Farbe hinzufügen',
    prefabs: 'Vorlagen', withPrefabs: '{label} · Vorlagen', sceneSorts: 'Arten von Szenen', prefabsFailed: 'Die Vorlagen konnten nicht geladen werden. Versuche es erneut.', prefabFailed: '„{name}“ konnte nicht geladen werden. Versuche es erneut.',
    previousPage: 'Zurück', nextPage: 'Weiter', pageCount: '{page} / {total}',
    minigameSorts: 'Minispiel-Kategorien', back: 'Zurück',
    deletePrefabAsk: 'Die Vorlage „{name}“ löschen? Spiele, in die sie eingefügt wurde, behalten ihre Szenen.', deleteFailed: 'Löschen hat nicht geklappt. Versuche es erneut.', loadingPrefabs: 'Vorlagen werden geladen…',
    noPrefabs: 'Noch keine Vorlagen. Wähle eine oder mehrere Szenen und drücke **Als Vorlage speichern**; sie erscheinen hier für jedes Spiel.', sceneOne: '1 Szene', sceneMany: '{count} Szenen', deletePrefab: 'Vorlage {name} löschen',
    saved: 'Als „{name}“ gespeichert. Du findest sie unter Eine Szene hinzufügen, im Reiter Vorlagen.', limit: 'Es gibt schon 200 Vorlagen. Lösche zuerst einige.', tooLarge: 'Das ist zu groß für eine Vorlage. Wähle weniger Szenen.',
    saveFailed: 'Speichern hat nicht geklappt. Versuche es erneut.', prefabName: 'Name der Vorlage', saving: 'Wird gespeichert…', savePrefab: 'Vorlage speichern', saveAsPrefab: 'Als Vorlage speichern',
    minimap: 'Überblick über das ganze Spiel. Klicke, um die Ansicht dorthin zu bewegen.',
  },
  ro: {
    all: 'Toate', other: 'Altele', sorts: 'Tipuri', chosen: 'Ales', cancel: 'Anulează', keep: 'Păstrează', choose: 'Alege…', addColour: 'Adaugă o culoare',
    prefabs: 'Prefabricate', withPrefabs: '{label} · Prefabricate', sceneSorts: 'Tipuri de scene', prefabsFailed: 'Prefabricatele nu au putut fi încărcate. Încearcă din nou.', prefabFailed: '„{name}” nu a putut fi încărcat. Încearcă din nou.',
    previousPage: 'Înapoi', nextPage: 'Înainte', pageCount: '{page} / {total}',
    minigameSorts: 'Categorii de minijocuri', back: 'Înapoi',
    deletePrefabAsk: 'Ștergi prefabricatul „{name}”? Jocurile în care a fost inserat își păstrează scenele.', deleteFailed: 'Ștergerea nu a mers. Încearcă din nou.', loadingPrefabs: 'Se încarcă prefabricatele…',
    noPrefabs: 'Încă niciun prefabricat. Alege una sau mai multe scene și apasă **Salvează ca prefabricat**; apar aici pentru fiecare joc.', sceneOne: '1 scenă', sceneMany: '{count} scene', deletePrefab: 'Șterge prefabricatul {name}',
    saved: 'Salvat ca „{name}”. Îl găsești la Adaugă o scenă, în fila Prefabricate.', limit: 'Există deja 200 de prefabricate. Șterge întâi câteva.', tooLarge: 'E prea mare pentru un prefabricat. Alege mai puține scene.',
    saveFailed: 'Salvarea nu a mers. Încearcă din nou.', prefabName: 'Numele prefabricatului', saving: 'Se salvează…', savePrefab: 'Salvează prefabricatul', saveAsPrefab: 'Salvează ca prefabricat',
    minimap: 'Privire de ansamblu asupra jocului. Apasă ca să muți vederea acolo.',
  },
});
