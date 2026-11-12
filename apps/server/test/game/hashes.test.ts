import { describe, expect, it } from 'vitest';
import { contentHash, parseDefinition } from '../../src/game/definition.js';
import { preparedGame } from '../../src/game/prepared-game.js';
import { builtInGames } from '../../src/game/templates.js';

// Published game versions are immutable and identified by these hashes. A format
// change must leave every existing definition parsing to exactly the same object.
describe('published definitions stay byte-identical', () => {
  it('keeps the hashes recorded before branching was added', () => {
    const hashes = Object.fromEntries([['prepared', preparedGame], ...builtInGames.filter(game => game.definition.formatVersion === 1).map(game => [game.key, game.definition] as const)]
      .map(([key, definition]) => [key, contentHash(parseDefinition(JSON.parse(JSON.stringify(definition))))]));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "first-reliable-game": "737e2310437da699a9084c78ed7a9b536b70b1258e01709b12f8aaa19817b4ea",
        "picture-party": "1360c36063e9934039575899fbedd600828169b6cf5e8efa583754fcd8f01c0b",
        "prepared": "737e2310437da699a9084c78ed7a9b536b70b1258e01709b12f8aaa19817b4ea",
        "team-party": "1ec94491954f66506cbc2e2c510b4f7524f215d3cbecbd4bdea8bd2172a1348b",
        "timed-quiz": "2df2da9971c473132494527db2d2a0862f588f2f3b990cf3e5d35065a2eae6d9",
      }
    `);
  });
});
