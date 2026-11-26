import { useEffect, useId, useRef, useState } from 'react';
import { authoredGraphs, AuthoredGraphsSchema, graphDataKey, GrapherImportResultSchema, MAX_STORED_GRAPHS, StoredGraphsSchema, type AuthoredGraph, type GraphData } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { roomApi } from '../../../room/api.js';
import { DialSlider } from '../../../ui/dial-slider.js';
import { grapherSeries, type GrapherSeries } from './graph-grapher.js';
import { GraphPreviewButton } from './graph-preview-button.js';
import { GraphCutoffChart } from './graph-cutoff.js';
import { GRAPH_EDITOR_TEXTS } from './graph-editor.text.js';
import type { Definition } from '../../model.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';
import { graphCutoffs, graphFromCsv, MAX_GRAPH_CSV_BYTES, readGraphCsv, type GraphTable } from './graph-csv.js';
import { Icon } from '../../controls/icons.js';
import './graph-data-import.css';

const METHODS = [
  ['url', 'linkMethod', 'globe'],
  ['file', 'fileMethod', 'file'],
  ['paste', 'pasteMethod', 'writing'],
] as const;

export type GraphImport = { graph: GraphData; question?: string };

function sourceKey(url: string | undefined) {
  if (!url) return undefined;
  const parsed = new URL(url);
  const countries = parsed.searchParams.get('country');
  if (countries) parsed.searchParams.set('country', countries.split('~').sort().join('~'));
  parsed.searchParams.sort();
  return parsed.href;
}

function matches(data: GraphImport, entries: Pick<AuthoredGraph, 'dataKey' | 'question' | 'sourceUrl' | 'sourceSeries'>[]) {
  const key = graphDataKey(data.graph);
  const url = sourceKey(data.graph.sourceUrl);
  return entries.some(entry => entry.dataKey === key || (url && sourceKey(entry.sourceUrl) === url &&
    (entry.sourceSeries ? entry.sourceSeries === data.graph.sourceSeries : Boolean(data.question && entry.question === data.question))));
}

export function GraphDataImport({ definition, gameId, pending = [], destination, onImport }: {
  definition: Definition; gameId: string | undefined; pending?: GraphImport[]; destination: 'scene' | 'library'; onImport: (picked: GraphImport | undefined, others: GraphImport[]) => void;
}) {
  const t = useTexts(GRAPH_TEXTS);
  const editor = useTexts(GRAPH_EDITOR_TEXTS);
  const [library, setLibrary] = useState<AuthoredGraph[]>([]);
  useEffect(() => {
    let active = true;
    void roomApi('/api/host/graphs').then(value => { if (active) setLibrary(AuthoredGraphsSchema.parse(value)); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>('url');
  const heading = useRef<HTMLHeadingElement>(null);
  const [localTable, setLocalTable] = useState<GraphTable>();
  const [remoteSeries, setRemoteSeries] = useState<GrapherSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState(0);
  const [url, setUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<'unsupportedUrl' | 'downloadFailed' | 'noSeries'>();
  const remote = remoteSeries[selectedSeries];
  const table = remote?.table ?? localTable;
  const [paste, setPaste] = useState('');
  const [column, setColumn] = useState(0);
  const [split, setSplit] = useState(0);
  const [error, setError] = useState(false);
  const [fileName, setFileName] = useState('');
  const latestRead = useRef(0);
  const slider = useId();
  const cutoffs = table ? graphCutoffs(table.axis) : [];
  const cutoff = cutoffs[split];
  const cutoffOptions = cutoffs.map(index => table!.labels[index]!);
  const build = (source: GrapherSeries | undefined, sourceTable: GraphTable, valueColumn: number, splitIndex: number): GraphImport | undefined => {
    const parsed = graphFromCsv(sourceTable, valueColumn, splitIndex);
    if (!parsed) return undefined;
    if (!source) return { graph: parsed };
    const { unit, key, source: credit, sourceNote, sourceUrl } = source;
    return { graph: { ...parsed, yLabel: unit, source: credit, sourceSeries: key, sourceNote, sourceUrl },
      question: t('importedQuestion', { title: source.title, entity: source.entity }).slice(0, 500) };
  };
  const candidate = table && cutoff !== undefined ? build(remote, table, column, cutoff) : undefined;
  const existing = [...library.filter(entry => entry.gameId !== gameId), ...[...authoredGraphs(definition), ...pending].map(({ graph, question }) => ({
    dataKey: graphDataKey(graph), sourceUrl: graph.sourceUrl, sourceSeries: graph.sourceSeries, question: question ?? '',
  }))];
  const selectedSaved = candidate && matches(candidate, existing);
  const linkExists = remote && existing.some(entry => sourceKey(entry.sourceUrl) === sourceKey(remote.sourceUrl));
  const nearest = (source: GraphTable, fraction: number) => {
    const axis = source.axis;
    const target = axis[0]! + (axis.at(-1)! - axis[0]!) * fraction;
    const available = graphCutoffs(axis);
    return available.reduce((best, index) => Math.abs(axis[index]! - target) < Math.abs(axis[best]! - target) ? index : best, available[0]!);
  };
  const otherSeries = candidate && table ? (remoteSeries.length
    ? remoteSeries.flatMap((source, index) => index === selectedSeries ? [] : [build(source, source.table, 0, nearest(source.table, candidate.graph.splitAt ?? .5))])
    : table.columns.flatMap((_, index) => index === column ? [] : [build(undefined, table, index, cutoff!)])) : [];
  const fresh = otherSeries.filter((other): other is GraphImport => Boolean(other && !matches(other, existing) &&
    (!candidate || graphDataKey(candidate.graph) !== graphDataKey(other.graph))));
  const slots = MAX_STORED_GRAPHS - (StoredGraphsSchema.safeParse(definition.graphLibrary).data?.length ?? 0) - pending.length;
  const allCount = fresh.length + (destination === 'library' && !selectedSaved ? 1 : 0);
  const reviewing = Boolean(candidate);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [reviewing]);

  const chooseTable = (parsed: GraphTable | null) => {
    const positions = parsed ? graphCutoffs(parsed.axis) : [];
    setColumn(0);
    if (parsed && positions.length) {
      const midpoint = (parsed.axis[0]! + parsed.axis.at(-1)!) / 2;
      const nearest = positions.reduce((best, index) => Math.abs(parsed.axis[index]! - midpoint) < Math.abs(parsed.axis[best]! - midpoint) ? index : best);
      setSplit(positions.indexOf(nearest));
    }
  };

  const load = (data: string, name = '') => {
    const parsed = readGraphCsv(data);
    setFileName(name);
    setRemoteSeries([]);
    setLocalTable(parsed ?? undefined);
    setUrlError(undefined);
    setError(!parsed || !graphCutoffs(parsed.axis).length);
    chooseTable(parsed);
  };
  const loadUrl = async () => {
    const request = ++latestRead.current;
    setLoadingUrl(true);
    setUrlError(undefined);
    try {
      const data = GrapherImportResultSchema.parse(await roomApi('/api/host/graph-import', { url }));
      if (request !== latestRead.current) return;
      const series = grapherSeries(data);
      if (!series.length) throw new Error('NO_SERIES');
      setFileName('');
      setRemoteSeries(series);
      setSelectedSeries(0);
      setLocalTable(undefined);
      setError(false);
      chooseTable(series[0]!.table);
    } catch (cause) {
      if (request === latestRead.current) setUrlError(cause instanceof Error && cause.message === 'UNSUPPORTED_GRAPH_URL' ? 'unsupportedUrl' : cause instanceof Error && cause.message === 'NO_SERIES' ? 'noSeries' : 'downloadFailed');
    } finally { if (request === latestRead.current) setLoadingUrl(false); }
  };

  const changeMethod = (next: typeof method) => {
    if (next === method) return;
    latestRead.current++;
    setLoadingUrl(false);
    setUrlError(undefined);
    setError(false);
    setLocalTable(undefined);
    setRemoteSeries([]);
    setMethod(next);
  };

  const changeData = () => {
    setLocalTable(undefined);
    setRemoteSeries([]);
  };

  return <div className="graph-data-import">
    <div className="graph-dialog-body graph-import-content" role="region" aria-label={t('importData')}>
      {table && candidate ? <div className="graph-dialog-surface graph-import-review">
        <div className="graph-import-controls">
          <h3 ref={heading} tabIndex={-1}>{t('reviewGraph')}</h3>
          {(candidate.question || fileName) && <p className="hint">{candidate.question || fileName}</p>}
          {remoteSeries.length > 1 && <label>{t('csvSeries')}<select value={selectedSeries} onChange={event => {
            const index = Number(event.currentTarget.value);
            setSelectedSeries(index);
            chooseTable(remoteSeries[index]!.table);
          }}>{remoteSeries.map(({ name }, index) => <option key={index} value={index}>{name}</option>)}</select></label>}
          {table.columns.length > 1 && <label>{t('csvSeries')}<select value={column} onChange={event => setColumn(Number(event.currentTarget.value))}>
            {table.columns.map(({ name }, index) => <option key={index} value={index}>{name || t('columnNumber', { number: index + 2 })}</option>)}
          </select></label>}
          {selectedSaved && <p className="hint" role="status">{editor('alreadySaved')}</p>}
          {linkExists && !selectedSaved && <p className="hint" role="status">{editor('linkExists')}</p>}
          {destination === 'scene' && fresh.length > 0 && <p className="hint">{editor('extraSeries')}</p>}
          {(allCount > slots || (destination === 'library' && slots <= 0)) && <p className="hint" role="status">{editor('limit')}</p>}
          <label htmlFor={slider}>{t('csvCutoff')}</label>
          <DialSlider id={slider} labels={cutoffOptions} value={split} onChange={setSplit} />
          <GraphPreviewButton definition={definition} graph={candidate.graph} question={candidate.question} />
        </div>
        <figure className="graph-import-chart">
          <GraphCutoffChart graph={candidate.graph} label={t('reviewGraph')}
            onMove={fraction => setSplit(cutoffs.indexOf(nearest(table, fraction)))} />
          <figcaption className="hint">{editor('dragHelp')}</figcaption>
        </figure>
      </div> : <div className="graph-dialog-surface graph-import-source">
        <h3 ref={heading} tabIndex={-1}>{t('chooseSource')}</h3>
        <div className="segmented graph-import-methods" role="group" aria-label={t('chooseSource')}>
          {METHODS.map(([key, label, icon]) => <button type="button" key={key} aria-pressed={method === key} onClick={() => changeMethod(key)}>
            <Icon name={icon} size={18} />{t(label)}
          </button>)}
        </div>
        <div className="graph-import-input">
          {method === 'url' && <>
            <label>{t('chartUrl')}<input type="url" inputMode="url" spellCheck={false} maxLength={500} value={url} readOnly={loadingUrl}
              placeholder="https://ourworldindata.org/grapher/…"
              onChange={event => { setUrl(event.currentTarget.value); setUrlError(undefined); }}
              onKeyDown={event => { if (event.key === 'Enter' && !loadingUrl && url.trim()) { event.preventDefault(); void loadUrl(); } }} /></label>
            {urlError && <p className="hint warn" role="alert">{t(urlError)}</p>}
          </>}
          {method === 'file' && <>
            <label className="graph-import-file">
              <Icon name="file" size={24} />
              <span>{t('csvFile')}</span>
              <small>CSV / TSV</small>
              <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" aria-label={t('csvFile')}
                onChange={async event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  const request = ++latestRead.current;
                  try {
                    const data = file.size <= MAX_GRAPH_CSV_BYTES ? await file.text() : '';
                    if (request === latestRead.current) load(data, file.name);
                  } catch {
                    if (request === latestRead.current) load('');
                  }
                }} />
            </label>
            <p className="hint">{t('csvHelp')}</p>
          </>}
          {method === 'paste' && <>
            <label>{t('pasteData')}<textarea rows={4} spellCheck={false} maxLength={MAX_GRAPH_CSV_BYTES} value={paste}
              onChange={event => setPaste(event.currentTarget.value)} /></label>
            <p className="hint">{t('csvHelp')}</p>
          </>}
          {(error || table) && <p className="hint warn" role="alert">{t(method === 'url' ? 'downloadFailed' : 'csvError')}</p>}
        </div>
      </div>}
    </div>
    {candidate ? <footer className="graph-dialog-footer">
      <button type="button" className="small-button" onClick={changeData}>{t('changeData')}</button>
      {fresh.length > 0 && <button type="button" className="small-button" disabled={allCount > slots}
        onClick={() => onImport(destination === 'library' && selectedSaved ? undefined : candidate, fresh)}>{editor('importAll')}</button>}
      <button type="button" className="configuration-apply" disabled={destination === 'library' && (selectedSaved || slots <= 0)}
        onClick={() => onImport(candidate, [])}>{t('useData')}</button>
    </footer> : method !== 'file' && <footer className="graph-dialog-footer">
      {method === 'url' ? <button type="button" className="configuration-apply" disabled={loadingUrl || !url.trim()} onClick={() => void loadUrl()}>
        {t(loadingUrl ? 'loadingUrl' : 'readUrl')}
      </button> : <button type="button" className="configuration-apply" disabled={!paste.trim()} onClick={() => load(paste)}>{t('readData')}</button>}
    </footer>}
  </div>;
}
