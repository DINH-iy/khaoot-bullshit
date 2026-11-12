import { createDatabase } from '../../src/database/client.js';
import { GameError } from '../../src/game/errors.js';
import { TrustedActorSchema } from '../../src/game/model.js';
import { createGameService } from '../../src/game/service.js';

const url = process.env['DATABASE_URL'];
if (!url || !new URL(url).pathname.endsWith('_test') || process.env['NODE_ENV'] !== 'test') throw new Error('Isolated test worker only');
const db = createDatabase(url, 1);
// No production routes or crash hooks: this separate process invokes the real
// service, while the test parent controls database gates and SIGKILL.
process.once('message', async (message: { actor: unknown; command: unknown }) => {
  try {
    const receipt = await createGameService(db.client).execute(TrustedActorSchema.parse(message.actor), message.command);
    process.send?.({ kind: 'committed', receipt });
  } catch (error) { process.send?.({ kind: 'failed', code: error instanceof GameError ? error.code : 'TEST_FAILURE' }); }
});
