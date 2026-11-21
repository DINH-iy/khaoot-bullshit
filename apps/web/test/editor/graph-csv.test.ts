import { describe, expect, it } from 'vitest';
import { grapherSeries } from '../../src/editor/scene/fields/graph-grapher.js';
import { graphCutoffs, graphFromCsv, readGraphCsv } from '../../src/editor/scene/fields/graph-csv.js';

describe('Draw the Graph imports', () => {
  it('reads a Trends-style CSV with a preamble, quotes, a value column picker, and <1 readings', () => {
    const data = readGraphCsv('\ufeffCategory: All categories\r\n\r\nMonth,"Tea, green","Coffee ""beans"""\r\n2020-01,<1,20\r\n2020-02,5,38\r\n2020-03,25,45\r\n2020-04,80,75\r\n2020-05,100,90')!;
    expect(data.columns[0]).toEqual({ name: 'Tea, green', values: [.5, 5, 25, 80, 100] });
    expect(graphFromCsv(data, 1, 2)).toMatchObject({
      yLabel: 'Coffee "beans"', startLabel: '2020-01', splitLabel: '2020-03', endLabel: '2020-05',
      scale: { min: 0, max: 100 }, splitAt: .5,
    });
  });

  it('uses chronological distances for irregular periods and keeps original scale labels', () => {
    const data = readGraphCsv('Year\tViews\n2020\t740\n2018\t620\n2014\t380\n2012\t260\n2010\t140')!;
    expect(data.labels).toEqual(['2010', '2012', '2014', '2018', '2020']);
    expect(graphCutoffs(data.axis)).toEqual([1, 2]);
    const result = graphFromCsv(data, 0, 2)!;
    expect(result.splitAt).toBe(.4);
    expect(result.scale).toEqual({ min: 0, max: 800 });
    expect(result.hidden[0]).toBeCloseTo(560 / 800 * 100);
    expect(result.hidden.at(-1)).toBeCloseTo(740 / 800 * 100);
  });

  it('resamples large series while rejecting invalid dates, duplicate periods, and incomplete numeric data', () => {
    const data = readGraphCsv(Array.from({ length: 200 }, (_, index) => `${index},${index * 2}`).join('\n'))!;
    expect(graphFromCsv(data, 0, 100)?.hidden).toHaveLength(50);
    expect(readGraphCsv('Year;Value\n2010;1,5\n2011;2,5\n2012;3,5\n2013;4,5')?.columns[0]?.values).toEqual([1.5, 2.5, 3.5, 4.5]);
    expect(readGraphCsv('Date,Value\n2020-01-01,0\n2020-02-30,1\n2020-03-01,2\n2020-04-01,3')).toBeNull();
    expect(readGraphCsv('Year,Value\n2010,0\n2010,1\n2012,2\n2013,3')).toBeNull();
    expect(readGraphCsv('Year,Value\n2010,0\n2011,\n2012,2\n2013,3')).toBeNull();
  });
});

it('picks a country and carries its Grapher units and credit into a playable series', () => {
  const sourceUrl = 'https://ourworldindata.org/grapher/life-expectancy';
  const csv = ['entity,code,year,life_expectancy_0',
    ...[2000, 2001, 2002, 2003, 2004].flatMap((year, index) => [`"Netherlands",NLD,${year},${index + 70}`, `Belgium,BEL,${year},${index + 60}`]),
  ].join('\n');
  const series = grapherSeries({ csv, sourceUrl, metadata: {
    chart: { title: 'Life expectancy' },
    columns: { life_expectancy_0: { unit: 'years', citationShort: 'Example provider', descriptionShort: 'Life expectancy at birth.' } },
  } });
  expect(series.map(({ name }) => name)).toEqual(['Netherlands', 'Belgium']);
  expect(series[1]).toMatchObject({ unit: 'years', source: 'Our World in Data · Example provider', sourceNote: 'Life expectancy at birth.', sourceUrl });
  expect(graphFromCsv(series[1]!.table, 0, 2)).toMatchObject({ splitLabel: '2002', endLabel: '2004' });
  expect(series[1]!.table.columns[0]!.values).toEqual([60, 61, 62, 63, 64]);
});
