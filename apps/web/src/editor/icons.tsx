// Simple line icons for scene types, drawn for this app (24×24, current colour).
const paths: Record<string, string> = {
  info: 'M4 7h16v12H4z M4 7l3-4 M10 7l3-4 M16 7l3-4 M4 11h16',
  quiz: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7 M12 17h.01',
  writing: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  upload: 'M4 5h16v14H4z M4 15l5-5 4 4 2-2 5 5 M15 9.5a1.5 1.5 0 1 0 0-.01',
  order: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  challenge: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  vote: 'M5 11h14v9H5z M9 15l2 2 4-4 M8 11V5h8v6',
  route: 'M4 12h6l4-6h6 M10 12l4 6h6 M17 3l3 3-3 3 M17 15l3 3-3 3',
  scoreboard: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3',
  minigame: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L15 14H9l-1.5 1.7A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4z M7 11v3 M5.5 12.5h3 M16 12h.01 M18 14h.01',
  start: 'M5 21V4 M5 4l12 5-12 5',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14 M5 12h14',
};
export function Icon({ name, size = 20, label }: { name: string; size?: number; label?: string }) {
  const d = paths[name] ?? paths['quiz']!;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
    role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{d.split(' M').map((part, index) => <path key={index} d={index ? `M${part}` : part} />)}</svg>;
}
/** The icon for a scene card, from its first part. */
export const sceneIcon = (kind: string, input: string | null) => kind === 'collect' ? ({ choice: 'quiz', text: 'writing', media: 'upload', order: 'order' } as Record<string, string>)[input ?? ''] ?? 'quiz' : kind;
