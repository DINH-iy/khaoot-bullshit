import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AwardMilliSchema, GameCommandSchema, InputSchema, SessionViewSchema } from '../src/index.js';

const ids = { commandId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002', stageRunId: '00000000-0000-4000-8000-000000000003' };
describe('public game contracts', () => {
  it('binds a submission to its stage without requiring the global revision', () => {
    const submit = { formatVersion: 1, ...ids, type: 'submission.submit', value: { kind: 'text', text: ' My excuse ' } };
    expect(GameCommandSchema.parse(submit).type).toBe('submission.submit');
    expect(GameCommandSchema.safeParse({ ...submit, actor: 'host', amountMilli: '1000' }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...submit, formatVersion: 2 }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...submit, value: { kind: 'text', text: 'x'.repeat(2001) } }).success).toBe(false);
  });
  it('requires host revisions and rejects float/coerced point amounts', () => {
    const judge = { formatVersion: 1, ...ids, expectedRevision: 1, type: 'stage.judge', playerId: ids.sessionId, amountMilli: '1000' };
    expect(GameCommandSchema.safeParse(judge).success).toBe(true);
    expect(GameCommandSchema.safeParse({ ...judge, expectedRevision: undefined }).success).toBe(false);
    for (const amount of [1, '01', '-1', '1.5', '1e3', '1000000000000']) expect(AwardMilliSchema.safeParse(amount).success).toBe(false);
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 999_999_999_999n }), amount => {
      expect(BigInt(AwardMilliSchema.parse(amount.toString()))).toBe(amount);
    }));
  });
  it('rejects ambiguous choices and secret fields in public views', () => {
    expect(InputSchema.safeParse({ kind: 'choice', options: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }).success).toBe(false);
    const view = { formatVersion: 1, sessionId: ids.sessionId, revision: 0, status: 'LOBBY', title: 'Party', stage: null, ownSubmission: null, standings: [] };
    expect(SessionViewSchema.safeParse(view).success).toBe(true);
    expect(SessionViewSchema.safeParse({ ...view, correctChoiceKey: 'a' }).success).toBe(false);
  });
});
