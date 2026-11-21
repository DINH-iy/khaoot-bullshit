import { expect, it } from 'vitest';
import { GRAPH_SAMPLES } from '@party/contracts';
import { graphPeriod, graphValue } from '../../src/minigames/draw-the-graph/graph-reading.js';

it('shows the sampled period and a value in the graph’s actual units', () => {
  const chart = { visible: [10, 20], splitLabel: '2010', endLabel: '2020', scale: { min: -10, max: 30 }, yLabel: '%' };
  expect(graphPeriod(chart, GRAPH_SAMPLES / 2, 'en')).toBe('2015');
  expect(graphPeriod({ ...chart, splitLabel: '2010-01', endLabel: '2010-07' }, GRAPH_SAMPLES / 2, 'en')).toBe('Apr 2010');
  expect(graphValue(chart, 500, 'en')).toBe('10%');
  expect(graphValue({ ...chart, yLabel: 'years' }, 750, 'en')).toBe('20 years');
});
