// Line icons for the editor and phone menu, drawn for this app (24×24, current colour).
const paths: Record<string, string> = {
  info: 'M4 7h16v12H4z M4 7l3-4 M10 7l3-4 M16 7l3-4 M4 11h16',
  quiz: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7 M12 17h.01',
  writing: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  upload: 'M4 5h16v14H4z M4 15l5-5 4 4 2-2 5 5 M15 9.5a1.5 1.5 0 1 0 0-.01',
  file: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',
  order: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  challenge: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  vote: 'M5 11h14v9H5z M9 15l2 2 4-4 M8 11V5h8v6',
  route: 'M4 12h6l4-6h6 M10 12l4 6h6 M17 3l3 3-3 3 M17 15l3 3-3 3',
  teams: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a6 6 0 0 1 12 0 M17 11a2.5 2.5 0 1 0 0-5 M16 14.5a5 5 0 0 1 5 5.5',
  scoreboard: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3',
  minigame: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L15 14H9l-1.5 1.7A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4z M7 11v3 M5.5 12.5h3 M16 12h.01 M18 14h.01',
  drawing: 'M3 21c3 0 4-2 4-4a2 2 0 0 1 4 0c0 2-2 4-8 4z M9.5 14.5L20 4 M17 3l4 4',
  start: 'M5 21V4 M5 4l12 5-12 5',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  // An eraser (gum): a slanted block with its rubber end, on a line.
  eraser: 'M14.5 4.5l5 5L11 18H6.5L3 14.5z M9 10l5 5 M6.5 18H21',
  // Start over: a circular arrow back to the beginning.
  restart: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14 M5 12h14',
  // A minigame draw: a card held in front of a second one, with a question mark.
  draw: 'M8 3h10a2 2 0 0 1 2 2v12 M4 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M7 12.5a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.3 M9 18h.01',
  // A wheel of fortune: a wheel with spokes and a pointer.
  wheel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18 M3 12h18 M5.6 5.6l12.8 12.8 M18.4 5.6L5.6 18.4 M12 1l-2 3h4z',
  // A duel: two crossed swords.
  duel: 'M4 4l9 9 M20 4l-9 9 M7 14l3 3 M17 14l-3 3 M5 16l-2 2 2 2 2-2 M19 16l2 2-2 2-2-2',
  // A menu of more actions: three lines.
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  // Send: a paper plane.
  send: 'M3 11l18-8-8 18-2-8z M11 13L21 3',
  // History: a clock with an arrow turning back.
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6 M3 3.5v5h5 M12 7.5V12l3 2',
  // A warning: a triangle with an exclamation mark (problems to fix first).
  warning: 'M12 3.5L2.5 20h19L12 3.5z M12 10v4.5 M12 17.2h.01',
  // The game menu: settings (a gear), inviting people (a person with a plus), exporting (an arrow out of a tray).
  gear: 'M19.1 9.8 L21.9 10.3 L21.9 13.7 L19.1 14.2 L18.5 15.5 L20.2 17.8 L17.8 20.2 L15.5 18.5 L14.2 19.1 L13.7 21.9 L10.3 21.9 L9.8 19.1 L8.5 18.5 L6.2 20.2 L3.8 17.8 L5.5 15.5 L4.9 14.2 L2.1 13.7 L2.1 10.3 L4.9 9.8 L5.5 8.5 L3.8 6.2 L6.2 3.8 L8.5 5.5 L9.8 4.9 L10.3 2.1 L13.7 2.1 L14.2 4.9 L15.5 5.5 L17.8 3.8 L20.2 6.2 L18.5 8.5z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  invite: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a6 6 0 0 1 12 0 M19 8v6 M16 11h6',
  export: 'M4 14v6h16v-6 M12 3v12 M8 7l4-4 4 4',
  // Copy: two overlapping sheets; Copied: a tick.
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  close: 'M6 6l12 12 M18 6L6 18',
  sound: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
  // Prefabs: two stacked cards.
  prefab: 'M8 8h12v12H8z M4 16V4h12',
  // Help: a question mark in a circle.
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4 M12 16.8h.01',
  // Tidying the map: a magic wand with sparkles.
  tidy: 'M4 20L15 9 M13 7l4 4 M18 3v3 M16.5 4.5h3 M20 9v2 M19 10h2 M8 3v2 M7 4h2',
  // Tidy into rows: cards in two rows.
  rows: 'M3 5h5v4H3z M10 5h5v4h-5z M17 5h4v4h-4z M3 15h5v4H3z M10 15h5v4h-5z',
  // One long line of cards.
  line: 'M2 9h5v6H2z M9.5 9h5v6h-5z M17 9h5v6h-5z',
  // Line up in a row / in a column.
  'align-row': 'M3 3v18 M7 8h4v8H7z M14 8h4v8h-4z M7 12h-4',
  'align-column': 'M3 3h18 M8 7h8v4H8z M8 14h8v4H8z M12 7V3',
  // Straighten arrows: a straight arrow.
  straighten: 'M4 12h15 M15 8l4 4-4 4',
  // Show the whole map: four corners.
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  // Zoom to the selection: a magnifier.
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  'zoom-in': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6 M11 8v6',
  'zoom-out': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6',
  // Actual size: 1:1.
  'actual-size': 'M5 9l2-1v8 M17 9l2-1v8 M12 10h.01 M12 14h.01',
  // Editing (a pencil) and viewing (an eye).
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  eye: 'M2 12c2.5-4.5 6-7 10-7s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  // More about something: an i in a circle.
  about: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5h.01',
  // Tips: a light bulb.
  tips: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  next: 'M5 12h14 M13 6l6 6-6 6',
  play: 'M7 4l13 8-13 8z',
  // Fold everything closed / open.
  'fold-all': 'M7 4l5 5 5-5 M7 20l5-5 5 5',
  'unfold-all': 'M7 9l5-5 5 5 M7 15l5 5 5-5',
  // Light and dark mode.
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  // Try it out: a flask.
  try: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7 15h10',
  chat: 'M20 4H4v12h5l-1 4 6-4h6z M8 9h8 M8 12h5',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 10h.01 M16 10h.01 M8 14a4.5 4.5 0 0 0 8 0',
  pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M10 9v6 M14 9v6',
  muted: 'M4 9h4l5-4v14l-5-4H4z M16 10l5 5 M21 10l-5 5',
  phone: 'M8 3h8v18H8z M11 17h2 M4 8v8 M20 8v8',
  exit: 'M11 4H4v16h7 M9 12h12 M17 8l4 4-4 4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a15 15 0 0 0 0 18 15 15 0 0 0 0-18z',
  cake: 'M4 13h16v7H4z M4 16c2 2 4 2 6 0 2 2 4 2 6 0 1 1 3 1 4 0 M8 13V9 M12 13V8 M16 13V9 M8 6h.01 M12 5h.01 M16 6h.01',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
  sparkles: 'M11 3l2.1 5.9L19 11l-5.9 2.1L11 19l-2.1-5.9L3 11l5.9-2.1z M19 3v5 M16.5 5.5h5 M20 16v5 M17.5 18.5h5',
  flag: 'M5 21V4 M5 5c5-4 9 4 14 0v9c-5 4-9-4-14 0',
  reels: 'M3 5h18v14H3z M9 5v14 M15 5v14 M5 10h2l-1.5 4 M11 10h2l-1.5 4 M17 10h2l-1.5 4',
  cards: 'M8 3h12v15H8z M4 7v14h12 M14 7l3 3.5-3 3.5-3-3.5z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  gift: 'M4 10h16v4H4z M5 14v7h14v-7 M12 10v11 M12 10H8a2.5 2.5 0 1 1 2.3-3.5L12 10z M12 10h4a2.5 2.5 0 1 0-2.3-3.5L12 10z',
  bars: 'M3 20h18 M5 20v-7h4v7 M10 20V4h4v16 M15 20V9h4v11',
  heart: 'M12 20 4.6 12.4a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5z',
};
export function Icon({ name, size = 20, label }: { name: string; size?: number; label?: string }) {
  const d = paths[name] ?? paths['quiz']!;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{d.split(' M').map((part, index) => <path key={index} d={index ? `M${part}` : part} />)}</svg>;
}
