import { useEffect, useId, useRef, useState } from 'react';
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

const METHODS = [
  ['url', 'linkMethod', 'globe'],
  ['file', 'fileMethod', 'file'],
  ['paste', 'pasteMethod', 'writing'],
] as const;

export function GraphDataImport({ onImport }: { onImport: (data: GraphData, question?: string) => void }) {
  const t = useTexts(GRAPH_TEXTS);
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
  const parsedGraph = table && cutoff !== undefined ? graphFromCsv(table, column, cutoff) : null;
  const candidate = parsedGraph && remote ? { ...parsedGraph, yLabel: remote.unit, source: remote.source, sourceNote: remote.sourceNote, sourceUrl: remote.sourceUrl } : parsedGraph;
  const question = remote ? t('importedQuestion', { title: remote.title, entity: remote.entity }) : undefined;
  const reviewing = Boolean(candidate);
  useEffect(() => {
    heading.current?.focus();
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
    <div className="graph-import-content" role="region" aria-label={t('importData')}>
      {table && candidate ? <div className="graph-import-review">
        <div className="graph-import-controls">
          <h3 ref={heading} tabIndex={-1}>{t('reviewGraph')}</h3>
          {(question || fileName) && <p className="hint">{question || fileName}</p>}
          {remoteSeries.length > 1 && <label>{t('csvSeries')}<select value={selectedSeries} onChange={event => {
            const index = Number(event.currentTarget.value);
            setSelectedSeries(index);
            chooseTable(remoteSeries[index]!.table);
          }}>{remoteSeries.map(({ name }, index) => <option key={index} value={index}>{name}</option>)}</select></label>}
          {table.columns.length > 1 && <label>{t('csvSeries')}<select value={column} onChange={event => setColumn(Number(event.currentTarget.value))}>
            {table.columns.map(({ name }, index) => <option key={index} value={index}>{name || t('columnNumber', { number: index + 2 })}</option>)}
          </select></label>}
          <label htmlFor={slider}>{t('csvCutoff')}</label>
          <DialSlider id={slider} labels={cutoffs.map(index => table.labels[index]!)} value={split} onChange={setSplit} />
        </div>
        <figure className="graph-import-chart">
          <GraphChart chart={candidate} answer={candidate.hidden} accessibleLabel={t('reviewGraph')} />
          <figcaption className="hint">{t('cutoffHelp')}</figcaption>
        </figure>
      </div> : <div className="graph-import-source">
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
            <button type="button" className="configuration-apply" disabled={loadingUrl || !url.trim()} onClick={() => void loadUrl()}>
              {t(loadingUrl ? 'loadingUrl' : 'readUrl')}
            </button>
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
            <button type="button" className="configuration-apply" disabled={!paste.trim()} onClick={() => load(paste)}>{t('readData')}</button>
          </>}
          {(error || table) && <p className="hint warn" role="alert">{t(method === 'url' ? 'downloadFailed' : 'csvError')}</p>}
        </div>
      </div>}
    </div>
    {candidate && <footer className="configuration-actions">
      <button type="button" className="small-button" onClick={changeData}>{t('changeData')}</button>
      <button type="button" className="configuration-apply" onClick={() => onImport(candidate, question)}>{t('useData')}</button>
    </footer>}
  </div>;
}
