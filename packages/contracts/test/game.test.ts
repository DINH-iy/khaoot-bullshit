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
  it('bounds host timer changes and keeps automatic closing free of client-chosen times', () => {
    const timer = { formatVersion: 1, ...ids, expectedRevision: 3, type: 'stage.timer' };
    for (const change of [{ kind: 'add', ms: 30_000 }, { kind: 'set', ms: 1000 }, { kind: 'clear' }]) expect(GameCommandSchema.safeParse({ ...timer, change }).success).toBe(true);
    for (const change of [{ kind: 'add', ms: 999 }, { kind: 'set', ms: 3_600_001 }, { kind: 'add', ms: 1500.5 }, { kind: 'clear', ms: 1000 }, { kind: 'set', deadlineAt: '2030-01-01T00:00:00Z' }]) expect(GameCommandSchema.safeParse({ ...timer, change }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...timer, change: { kind: 'clear' }, expectedRevision: undefined }).success).toBe(false);
    const timeout = { formatVersion: 1, ...ids, type: 'stage.timeout' };
    expect(GameCommandSchema.safeParse(timeout).success).toBe(true);
    expect(GameCommandSchema.safeParse({ ...timeout, closedAt: '2020-01-01T00:00:00Z' }).success).toBe(false);
  });
  it('offers list, tile and ordering answer styles with strict shapes', () => {
    const options = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }];
    for (const input of [{ kind: 'choice', options }, { kind: 'choice', options, layout: 'tiles' }, { kind: 'choice', options, layout: 'list' }, { kind: 'order', items: options }]) expect(InputSchema.safeParse(input).success).toBe(true);
    for (const input of [{ kind: 'choice', options, layout: 'carousel' }, { kind: 'order', items: [options[0]] }, { kind: 'order', items: [options[0], options[0]] }, { kind: 'order', items: options, correctOrder: ['a', 'b'] }]) expect(InputSchema.safeParse(input).success).toBe(false);
    const submit = { formatVersion: 1, ...ids, type: 'submission.submit' };
    expect(GameCommandSchema.safeParse({ ...submit, value: { kind: 'order', keys: ['a', 'b'] } }).success).toBe(true);
    expect(GameCommandSchema.safeParse({ ...submit, value: { kind: 'order', keys: ['a'] } }).success).toBe(false);
  });
  it('keeps score corrections exact, signed, non-zero and explained', () => {
    const adjust = { formatVersion: 1, commandId: ids.commandId, sessionId: ids.sessionId, expectedRevision: 4, type: 'score.adjust', playerId: ids.stageRunId, reason: 'Wrong judgment' };
    for (const amountMilli of ['-5000', '1', '999999999999']) expect(GameCommandSchema.safeParse({ ...adjust, amountMilli }).success).toBe(true);
    for (const amountMilli of ['0', '-0', '1.5', '+5', -5000, '1000000000000']) expect(GameCommandSchema.safeParse({ ...adjust, amountMilli }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...adjust, amountMilli: '1000', reason: '  ' }).success).toBe(false);
  });
  it('lets the host choose a route by option key only, with a revision', () => {
    const decide = { formatVersion: 1, ...ids, expectedRevision: 2, type: 'route.decide', optionKey: 'music' };
    expect(GameCommandSchema.safeParse(decide).success).toBe(true);
    expect(GameCommandSchema.safeParse({ ...decide, expectedRevision: undefined }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...decide, destinationNodeKey: 'music' }).success).toBe(false);
    expect(GameCommandSchema.safeParse({ ...decide, optionKey: 'not a key!' }).success).toBe(false);
  });
  it('rejects ambiguous choices and secret fields in public views', () => {
    expect(InputSchema.safeParse({ kind: 'choice', options: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }).success).toBe(false);
    const view = { formatVersion: 1, sessionId: ids.sessionId, revision: 0, status: 'LOBBY', title: 'Party', stage: null, serverTime: '2026-11-12T10:00:00.000Z', teamStandings: [], ownSubmission: null, standings: [], presentation: { texts: {}, animations: {}, themes: [] } };
    expect(SessionViewSchema.safeParse(view).success).toBe(true);
    expect(SessionViewSchema.safeParse({ ...view, correctChoiceKey: 'a' }).success).toBe(false);
  });
});
