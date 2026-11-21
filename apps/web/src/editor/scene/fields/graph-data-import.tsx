import { useId, useRef, useState } from 'react';
import { GrapherImportResultSchema, type GraphData } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { roomApi } from '../../../room/api.js';
import { DialSlider } from '../../../ui/dial-slider.js';
import { grapherSeries, type GrapherSeries } from './graph-grapher.js';
import { GraphChart } from '../../../minigames/draw-the-graph/graph-chart.js';
import { GRAPH_TEXTS } from '../../../minigames/draw-the-graph/graph.text.js';
import { graphCutoffs, graphFromCsv, MAX_GRAPH_CSV_BYTES, readGraphCsv, type GraphTable } from './graph-csv.js';
import { Icon } from '../../controls/icons.js';
import './graph-data-import.css';

export function GraphDataImport({ onImport }: { onImport: (data: GraphData, question?: string) => void }) {
  const t = useTexts(GRAPH_TEXTS);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [localTable, setLocalTable] = useState<GraphTable>();
  const [remoteSeries, setRemoteSeries] = useState<GrapherSeries[]>([]);
  const [selectedSeries, setSelectedSeries] = useState(0);
  const [url, setUrl] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<'unsupportedUrl' | 'downloadFailed'>();
  const remote = remoteSeries[selectedSeries];
  const table = remote?.table ?? localTable;
  const [paste, setPaste] = useState('');
  const [column, setColumn] = useState(0);
  const [split, setSplit] = useState(0);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const latestRead = useRef(0);
  const slider = useId();
  const cutoffs = table ? graphCutoffs(table.axis) : [];
  const cutoff = cutoffs[split];
  const parsedGraph = table && cutoff !== undefined ? graphFromCsv(table, column, cutoff) : null;
  const candidate = parsedGraph && remote ? { ...parsedGraph, yLabel: remote.unit, source: remote.source, sourceNote: remote.sourceNote, sourceUrl: remote.sourceUrl } : parsedGraph;
  const question = remote ? t('importedQuestion', { title: remote.title, entity: remote.entity }) : undefined;
  const chooseTable = (parsed: GraphTable | null) => {
    const positions = parsed ? graphCutoffs(parsed.axis) : [];
    setColumn(0);
    setDone(false);
    if (parsed && positions.length) {
      const midpoint = (parsed.axis[0]! + parsed.axis.at(-1)!) / 2;
      const nearest = positions.reduce((best, index) => Math.abs(parsed.axis[index]! - midpoint) < Math.abs(parsed.axis[best]! - midpoint) ? index : best);
      setSplit(positions.indexOf(nearest));
    }
  };

  const load = (data: string) => {
    const parsed = readGraphCsv(data);
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
      if (!series.length) throw new Error('No time series');
      setRemoteSeries(series);
      setSelectedSeries(0);
      setLocalTable(undefined);
      setError(false);
      chooseTable(series[0]!.table);
    } catch (cause) {
      if (request === latestRead.current) setUrlError(cause instanceof Error && cause.message === 'UNSUPPORTED_GRAPH_URL' ? 'unsupportedUrl' : 'downloadFailed');
    } finally { setLoadingUrl(false); }
  };

  return <div className="graph-data-import">
    <button type="button" className="graph-import-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(current => !current)}>
      <Icon name="upload" size={18} />
      <span>{t('importData')}</span>
      <span className="graph-import-indicator" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <div id={panelId} className="minigame-fields graph-import-panel" hidden={!open}>
    <label>{t('chartUrl')}<input type="url" inputMode="url" spellCheck={false} maxLength={500} value={url}
      onChange={event => setUrl(event.currentTarget.value)} /></label>
    <button type="button" className="small-button" disabled={loadingUrl || !url.trim()} onClick={() => void loadUrl()}>
      {t(loadingUrl ? 'loadingUrl' : 'readUrl')}</button>
    {urlError && <p className="hint warn" role="alert">{t(urlError)}</p>}
    <p className="hint">{t('csvHelp')}</p>
    <label>{t('csvFile')}<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"
      onChange={async event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) return;
        const request = ++latestRead.current;
        try {
          const data = file.size <= MAX_GRAPH_CSV_BYTES ? await file.text() : '';
          if (request === latestRead.current) load(data);
        } catch {
          if (request === latestRead.current) load('');
        }
      }} /></label>
    <label>{t('pasteData')}<textarea rows={3} spellCheck={false} maxLength={MAX_GRAPH_CSV_BYTES} value={paste}
      onChange={event => setPaste(event.currentTarget.value)} /></label>
    <button type="button" className="small-button" disabled={!paste.trim()} onClick={() => { latestRead.current++; load(paste); }}>{t('readData')}</button>
    {error && <p className="hint warn" role="alert">{t('csvError')}</p>}
    {table && candidate && <>
      {remoteSeries.length > 1 && <label>{t('csvSeries')}<select value={selectedSeries} onChange={event => {
        const index = Number(event.currentTarget.value);
        setSelectedSeries(index);
        chooseTable(remoteSeries[index]!.table);
      }}>{remoteSeries.map(({ name }, index) => <option key={index} value={index}>{name}</option>)}</select></label>}
      {table.columns.length > 1 && <label>{t('csvSeries')}<select value={column} onChange={event => { setColumn(Number(event.currentTarget.value)); setDone(false); }}>
        {table.columns.map(({ name }, index) => <option key={index} value={index}>{name || t('columnNumber', { number: index + 2 })}</option>)}
      </select></label>}
      <label htmlFor={slider}>{t('csvCutoff')}</label>
      <DialSlider id={slider} labels={cutoffs.map(index => table.labels[index]!)} value={split}
        onChange={next => { setSplit(next); setDone(false); }} />
      {question && <p className="hint">{question}</p>}
      <GraphChart chart={candidate} answer={candidate.hidden} />
      <button type="button" className="small-button" onClick={() => {
        onImport(candidate, question);
        setDone(true);
      }}>{t('useData')}</button>
      {done && <p role="status">{t('dataUsed')}</p>}
    </>}
    </div>
  </div>;
}
