import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AwardMilliSchema, GameKeySchema, InputSchema } from '@party/contracts';
import { GameError } from './errors.js';

const scoring = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('correct-choice'), correctChoiceKey: GameKeySchema, awardMilli: AwardMilliSchema }).strict(),
]);
const common = { key: GameKeySchema, prompt: z.string().trim().min(1).max(2000), durationMs: z.number().int().min(1000).max(3_600_000).nullable() };
const stageSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('collect'), input: InputSchema, scoring }).strict(),
  z.object({ ...common, kind: z.literal('challenge'), maxAwardMilli: AwardMilliSchema }).strict(),
]);
// Authoritative definitions stay server-only. Shared contracts expose safe views,
// never future stages, correct answers, or scoring implementation.
export const GameDefinitionSchema = z.object({
  formatVersion: z.literal(1), title: z.string().trim().min(1).max(160), startNodeKey: GameKeySchema,
  nodes: z.array(z.object({ key: GameKeySchema, stages: z.array(stageSchema).min(1).max(20) }).strict()).min(1).max(100),
  edges: z.array(z.object({ key: GameKeySchema, from: GameKeySchema, to: GameKeySchema }).strict()).max(99),
}).strict().superRefine((definition, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const keys = new Set(definition.nodes.map(node => node.key));
  if (keys.size !== definition.nodes.length) fail('Duplicate node key');
  if (!keys.has(definition.startNodeKey)) fail('Missing start node');
  if (new Set(definition.edges.map(edge => edge.key)).size !== definition.edges.length) fail('Duplicate edge key');
  const next = new Map<string, string>();
  for (const edge of definition.edges) {
    if (!keys.has(edge.from) || !keys.has(edge.to)) fail('Missing edge endpoint');
    if (next.has(edge.from)) fail('Branching requires a later definition format');
    next.set(edge.from, edge.to);
  }
  let count = 0;
  for (const node of definition.nodes) {
    count += node.stages.length;
    if (new Set(node.stages.map(stage => stage.key)).size !== node.stages.length) fail('Duplicate stage key');
    for (const stage of node.stages) {
      if (stage.kind === 'collect' && stage.scoring.kind === 'correct-choice') {
        const rule = stage.scoring;
        if (stage.input.kind !== 'choice' || !stage.input.options.some(option => option.key === rule.correctChoiceKey)) fail('Invalid correct choice');
      }
    }
  }
  if (count > 200) fail('Too many stages');
  const visited = new Set<string>();
  let key: string | undefined = definition.startNodeKey;
  while (key !== undefined && keys.has(key) && !visited.has(key)) { visited.add(key); key = next.get(key); }
  if (key !== undefined) fail('Cycle or invalid route');
  if (visited.size !== keys.size) fail('Unreachable node');
});
export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type StageDefinition = GameDefinition['nodes'][number]['stages'][number];

export function parseDefinition(value: unknown): GameDefinition {
  const parsed = GameDefinitionSchema.safeParse(value);
  if (!parsed.success) throw new GameError('INVALID_DEFINITION');
  return parsed.data;
}

export function executionStages(definition: GameDefinition) {
  const nodes = new Map(definition.nodes.map(node => [node.key, node]));
  const next = new Map(definition.edges.map(edge => [edge.from, edge.to]));
  const stages: { nodeKey: string; stage: StageDefinition }[] = [];
  let key: string | undefined = definition.startNodeKey;
  while (key) {
    const node = nodes.get(key)!;
    for (const stage of node.stages) stages.push({ nodeKey: key, stage });
    key = next.get(key);
  }
  return stages;
}

export function assertExecutable(definition: GameDefinition): void {
  // Timer admission/closing and asset validation are separate planned slices.
  if (executionStages(definition).some(({ stage }) => stage.durationMs !== null || (stage.kind === 'collect' && stage.input.kind === 'drawing'))) throw new GameError('UNSUPPORTED_FEATURE');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
