// Shared by the boards and the replay: the rock paper scissors icons, chess pieces as text, and a position's squares.
export const RPS_ICONS = { rock: '✊', paper: '✋', scissors: '✌️' } as const;
// Chess pieces as text (drawn with a variation selector so phones do not show them as emoji).
export const PIECES: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
/** The 64 squares of a position (a8 first), each with its piece letter or ''. */
export function squaresOf(fen: string): { square: string; piece: string }[] {
  return fen.split(' ')[0]!.split('/').flatMap((rank, row) => [...rank].flatMap(char => /\d/.test(char) ? Array<string>(Number(char)).fill('') : [char])
    .map((piece, column) => ({ square: `${'abcdefgh'[column]}${8 - row}`, piece })));
}
