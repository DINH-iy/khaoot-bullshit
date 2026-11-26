export type PatchNoteDay = { date: string; changes: string[] };
export const COMMIT_NOTES_PATH = 'patch-notes/commits.json';

// The curated history covers commits through 39aa19b. Newer entries come from Git.
export const PATCH_NOTES: PatchNoteDay[] = [
  {
    date: '2026-11-26',
    changes: [
      'Hangman players can guess the whole word. A wrong guess costs a life and appears alongside the wrong letters.',
      'Teams can use their own emoji and upload or record a short sound for their celebration.',
    ],
  },
  {
    date: '2026-11-25',
    changes: [
      'Added Hangman (Galgje) and Undercover / Mr. White to hosted games and Arcade. Hosts can supply their own words and word pairs for a room.',
      'Teams can elect captains by phone or have the host assign them. They can also pick an emoji, cheer and sound to play when they win.',
      'Added options for carrying team scores over when teams are formed again, including sharing out old scores or entering new totals.',
      'Hosts can correct quiz and ordering verdicts after the reveal, with the corresponding points updated.',
      'Authors can set room defaults per game and add custom reactions and soundboard clips.',
      'Added per-game sharing and configurable roles. Editors can see their own games and games shared with them.',
      'Added Device logs to help diagnose failed actions, reconnects and slow requests. Admin gained live-room controls, storage cleanup, an action log and a health view.',
      'Added screen reader descriptions for pictures, captions for scene media, shared-screen playback controls, and playlist shuffle and fades.',
      'Added custom game names in Arcade and refined the join-screen look, Speed Run and player statistics.',
      'Added a host-controlled coin flip for Heads or Tails, the Rainbow bet in Drive the Bus, and more avatar parts such as facial hair, piercings and tattoos.',
      'Added Flow editor context menus and clearer controls for giving a scene its own look or returning it to the game-wide style.',
    ],
  },
  {
    date: '2026-11-24',
    changes: [
      'Expanded Roulette into a full European table with number, colour, parity, range, dozen and column bets across hosted games, Arcade and solo play.',
      'Redesigned Arcade lobbies around a next-round card, player and invite controls, lobby locking, and a picker for solo, team and head-to-head games. Improved round results and shared-screen setup.',
      'Cut the Line and Match the Angle now let players aim in tenths. Refined dot patterns, the reveal and result displays for Count the Dots.',
      'Updated 8-ball pool with live aiming, clearer pocketed-ball displays and changes to table styling and shot playback.',
      'Added editor save points, named reusable styles, a shared media library menu and more realistic phone previews with selectable device models.',
      'Added the Minigame Draw scene, Flow groups and layout shortcuts, and team colour settings.',
      'Improved drawing controls, scene media tools, graph data imports, and People search for names with accents.',
    ],
  },
  {
    date: '2026-11-22',
    changes: [
      'Expanded Arcade to the minigame and head-to-head catalog, including team rounds, round results and optional shared screens.',
      'Refined Minigame Tryout and scene practice, including an option to practice 8-ball and replay rounds quickly.',
      'Improved 8-ball physics, aiming, shot sounds, table visuals and replays. Added more options for configuring Count the Dots patterns.',
      'Expanded the Draw the Graph importer and improved graph previews.',
      'Added shared custom fonts, including font uploads and font selection for game and join-screen styles.',
      'Added direct owner sign-in on eligible local development servers and improved navigation when pages or rooms become unavailable.',
    ],
  },
  {
    date: '2026-11-21',
    changes: [
      'Added Minigame Tryout to play and replay stock minigames from the host menu or Test Bench.',
      'Added 8-ball pool as a head-to-head game and phone challenge, with optional chip stakes.',
      'Improved Draw the Graph with data import and reveal playback, and refined Count the Dots patterns and judging.',
      'Updated minigame setup previews, drawing controls and phone layouts.',
    ],
  },
  {
    date: '2026-11-20',
    changes: [
      'Added Speed Run, Clap the Beat, Cut the Line, Match the Angle, Count the Dots, Heads or Tails, Red or Black Roulette and Draw the Graph.',
      'Speed Run gained a course editor, and Clap the Beat gained an optional microphone mode and a mic test.',
      'Added configurable phone menu icons and expanded room, arcade and side-game options. New rooms enable side games with chip play disabled by default.',
      'Improved room leaving and closing, the Test Bench, editor guidance, edit history, group management and screen layouts.',
    ],
  },
  {
    date: '2026-11-19',
    changes: [
      'Added an English, Dutch, German and Romanian language picker and tools for authors to translate their game text.',
      'Added music and video scenes, more scene media controls, audio trimming and playlist tools.',
      'Added People groups, password protection for Arcade lobbies, more player moderation controls and an option to use a connected player phone for host controls.',
      'Added automatic reveal options and single-choice, multiple-choice and ranked voting.',
      'Improved the editor, phone menus and feedback tools, and fixed the room’s People panel after the translation changes.',
    ],
  },
  {
    date: '2026-11-18',
    changes: [
      'Opened Arcade so friends can start standalone minigame lobbies without a hosted party game.',
      'Expanded chips and packs with configurable earnings, custom packs and owner controls. Updated the side-game and Arcade interfaces.',
      'Added optional account creation at join, a host list of expected players and more People statistics.',
      'Improved the built-in game picker, draft handling and the editor’s problems and history panels.',
    ],
  },
  {
    date: '2026-11-17',
    changes: [
      'Added Drive the Bus and Left or Right, and expanded team choice controls for step games.',
      'Added configurable explanations for games and improved scene templates and text settings.',
      'Expanded Look & feel with custom answer marks, palettes and animation controls. Updated the Flow and Scene editors, wheel testing and editor menus.',
      'Added bulk completion for filtered feedback reports and reorganized the code for rooms, minigames and the editor.',
    ],
  },
  {
    date: '2026-11-16',
    changes: [
      'Added Pick teams scenes and support for awarding and spending chips in more parts of a game.',
      'Made awards swipeable, applied player look changes immediately and improved the return to the lobby.',
      'Added submission on time-up where supported, and refined room settings, reconnects, drawing and editor controls after playtesting.',
    ],
  },
  {
    date: '2026-11-14',
    changes: [
      'Added in-app bug reports and suggestions, with the option to point at the part of the screen involved.',
      'Added People profiles and personal sign-in keys. Owners can grant editor access, and profiles keep looks and chips across games.',
      'Introduced phone side games and head-to-head challenges in rock paper scissors, tic-tac-toe and chess.',
      'Added hosted duels, points by place and reusable scene prefabs. Refined editor controls and collaboration.',
      'Added owner navigation and improved visitor address handling for locally hosted games shared through a tunnel.',
      'Paused the automatic CI workflow and documented how to share a test version.',
    ],
  },
  {
    date: '2026-11-13',
    changes: [
      'Expanded the Flow, Scene and Look & feel editors with draft rehearsal, media and more room and scene settings.',
      'Added collaborative editing and live changes to upcoming scenes during a hosted game.',
      'Added drawing and voting rounds, new minigames, player reactions, break votes, wheels of fortune and a configurable awards finale.',
      'Improved the phone lobby, seat recovery, game picker and host tools.',
    ],
  },
  {
    date: '2026-11-12',
    changes: [
      'Built the first playable browser rooms with host controls, a shared display, room codes and QR joining.',
      'Added timed stages, private submissions, reveals, scoring and support for teams and branching routes.',
      'Added reconnect and seat recovery, media uploads and local owner hosting.',
      'Introduced the game library and first draft editor, with text import, publishing and rehearsal.',
    ],
  },
  {
    date: '2026-11-11',
    changes: [
      'Set up the web app, server and shared game contracts, with the first PostgreSQL migrations and server health checks.',
      'Documented the room reliability, editor, testing and accessibility plans, and saved the first design references.',
    ],
  },
  {
    date: '2026-11-09',
    changes: [
      'Started the project and wrote the first plan for a browser-based party game builder with a shared screen and phone controllers.',
    ],
  },
];
