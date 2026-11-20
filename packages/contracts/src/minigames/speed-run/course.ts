export const COURSE_WIDTH = 7;
export const COURSE_HEIGHT = 5;
export const SPEED_RUN_COURSE = [
  'S...#..',
  '.##...#',
  '....#..',
  '##.#...',
  '......F',
] as const;

export const SPEED_RUN_START = 0;
export const SPEED_RUN_FINISH = COURSE_WIDTH * COURSE_HEIGHT - 1;
const DIRECTIONS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] } as const;
export type RaceDirection = keyof typeof DIRECTIONS;

export function raceOptions(course: readonly string[], cell: number): { direction: RaceDirection; cell: number }[] {
  const x = cell % COURSE_WIDTH;
  const y = Math.floor(cell / COURSE_WIDTH);
  return (Object.keys(DIRECTIONS) as RaceDirection[]).flatMap(direction => {
    const [dx, dy] = DIRECTIONS[direction];
    const nextX = x + dx;
    const nextY = y + dy;
    const tile = nextX >= 0 ? course[nextY]?.[nextX] : undefined;
    return tile && tile !== '#' ? [{ direction, cell: nextY * COURSE_WIDTH + nextX }] : [];
  });
}

export function raceCourseHasRoute(course: readonly string[]): boolean {
  const visited = new Set([SPEED_RUN_START]);
  const pending = [SPEED_RUN_START];
  for (const cell of pending) {
    if (cell === SPEED_RUN_FINISH) return true;
    for (const move of raceOptions(course, cell)) {
      if (visited.has(move.cell)) continue;
      visited.add(move.cell);
      pending.push(move.cell);
    }
  }
  return false;
}
