import type { Presentation } from '@party/contracts';
import type { Definition } from '../model.js';

/** Where a look change applies: the whole game, or one part of one scene (which then differs from the game). */
export type Scope = { kind: 'game' } | { kind: 'scene'; nodeKey: string; stageIndex: number };

export function layerOf(definition: Definition, scope: Scope): Presentation {
  if (scope.kind === 'game') return (definition['presentation'] ?? {}) as Presentation;
  const stage = definition.nodes.find(node => node.key === scope.nodeKey)?.stages[scope.stageIndex];
  return (stage?.['presentation'] ?? {}) as Presentation;
}

/** Drops empty parts so an untouched look leaves no trace in the game (and its content hash). */
function tidy(layer: Presentation): Presentation | undefined {
  const next: Presentation = {};
  if (layer.texts && Object.keys(layer.texts).length) next.texts = layer.texts;
  if (layer.animations && Object.keys(layer.animations).length) next.animations = layer.animations;
  if (layer.theme) {
    const theme = { ...layer.theme }; if (theme.colors && !Object.keys(theme.colors).length) delete theme.colors;
    if (Object.keys(theme).length) next.theme = theme;
  }
  return Object.keys(next).length ? next : undefined;
}

export function withLayer(definition: Definition, scope: Scope, layer: Presentation): Definition {
  const clean = tidy(layer);
  if (scope.kind === 'game') { const next = { ...definition }; if (clean) next['presentation'] = clean; else delete next['presentation']; return next; }
  return { ...definition, nodes: definition.nodes.map(node => node.key !== scope.nodeKey ? node : { ...node, stages: node.stages.map((stage, index) => {
    if (index !== scope.stageIndex) return stage; const next = { ...stage }; if (clean) next['presentation'] = clean; else delete next['presentation']; return next;
  }) }) };
}
