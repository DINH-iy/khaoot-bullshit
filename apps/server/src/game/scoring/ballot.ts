import { SubmissionValueSchema, voteChoices } from '@party/contracts';
import type { StageDefinition } from '../definition.js';

/** An approval counts once. A ranked ballot gives its first choice the limit, then one less per rank. */
export function ballotTally(stage: Extract<StageDefinition, { kind: 'vote' }>, rows: readonly { value: unknown }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = SubmissionValueSchema.safeParse(row.value);
    if (!value.success) continue;
    voteChoices(value.data).forEach((id, rank) => {
      const weight = stage.voteMode === 'ranked' ? (stage.voteLimit ?? 3) - rank : 1;
      totals.set(id, (totals.get(id) ?? 0) + weight);
    });
  }
  return totals;
}
