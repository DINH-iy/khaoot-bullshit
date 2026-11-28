import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SCENE_TEXT_BOXES, MAX_SCENE_TEXT_LENGTH, MAX_SCENE_TITLE_LENGTH, SCENE_TEXT_ALIGNMENTS, SCENE_TEXT_VERTICAL_ALIGNMENTS, SCENE_TEXT_SIZES, SCENE_TEXT_FONTS, SCENE_TEXT_OVERFLOWS, SCENE_TEXT_WRAPS, type SceneCharacterStyle, type SceneTextMark, type SceneTextStyle } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { SceneTextContent, sceneTextProps } from '../../../presentation/scene-text.js';
import { Dropdown } from '../../../ui/dropdown.js';
import { ConfirmDialog } from '../../controls/confirm-dialog.js';
import { LOOK_TEXTS } from '../../look/look.text.js';
import { formatSelection } from '../text-marks.js';
import { TEXT_BOX_TEXTS } from './text-boxes.text.js';
import { INSPECTOR_TEXTS } from '../inspector.text.js';
import { uniqueKey, type Stage } from '../../model.js';
import { sceneTextBoxes, sceneTextStyle, setSceneTextBoxes, updateBoxText, updateTextFormat, type SceneTextTarget } from '../text-edits.js';

const presets = ['blank', 'heading', 'instructions', 'points'] as const;
type Preset = typeof presets[number];
const fontNames = { system: 'fSystem', rounded: 'fRounded', serif: 'fSerif', slab: 'fSlab', mono: 'fMono', condensed: 'fCondensed', playful: 'fPlayful', elegant: 'fElegant' } as const;

export function SceneTextSettings({ stage, selectedTarget, onSelect, edit }: {
  stage: Stage;
  selectedTarget: SceneTextTarget;
  onSelect: (target: SceneTextTarget) => void;
  edit: (change: (stage: Stage) => Stage, field: string) => void;
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  const fields = useTexts(INSPECTOR_TEXTS);
  const boxes = sceneTextBoxes(stage);
  const selected = boxes.find(box => selectedTarget === `box:${box.key}`);
  const target = selected ? `box:${selected.key}` as const : selectedTarget === 'titleStyle' && stage.kind === 'info' ? 'titleStyle' : 'promptStyle';
  const format = selected ?? sceneTextStyle(stage, target === 'titleStyle' ? 'titleStyle' : 'promptStyle') ?? {};
  const defaultSize = target === 'titleStyle' ? 'heading' : 'body';
  const targets = [
    ...(stage.kind === 'info' ? [{ value: 'titleStyle', label: fields('title') }] : []),
    { value: 'promptStyle', label: fields(stage.kind === 'info' ? 'lInfo' : 'lQuestion') },
    ...boxes.map((box, index) => ({ value: `box:${box.key}`, label: t('box', { number: index + 1 }) })),
  ];
  const [removing, setRemoving] = useState<string>();
  const [formatting, setFormatting] = useState(false);
  const index = selected ? boxes.indexOf(selected) : -1;
  const onFormat = (patch: SceneTextStyle | null) => edit(current => updateTextFormat(current, target, patch), `format-${target}`);
  const move = (direction: -1 | 1) => {
    if (!selected) return;
    const next = [...boxes];
    next.splice(index, 1);
    next.splice(index + direction, 0, selected);
    edit(current => setSceneTextBoxes(current, next), 'textBoxes');
  };
  const add = (preset: Preset) => {
    const text = { blank: '', heading: t('heading'), instructions: t('instructionsText'), points: t('pointsText') };
    const sizes = { blank: 'body', heading: 'heading', instructions: 'body', points: 'small' } as const;
    const key = uniqueKey('text', boxes.map(box => box.key));
    edit(current => setSceneTextBoxes(current, [...boxes, { key, text: text[preset], size: sizes[preset] }]), 'textBoxes');
    onSelect(`box:${key}`);
  };
  return <div className="canvas-text-controls">
    <div className="canvas-text-tools">
      <Dropdown label={t('add')} placeholder={`+ ${t('add')}`} value="" onChange={value => add(value as Preset)}
        options={presets.map(value => ({ value, label: t(value) }))} disabled={boxes.length >= MAX_SCENE_TEXT_BOXES} />
      <button type="button" className="small-button" aria-expanded={formatting} onClick={() => setFormatting(!formatting)}>{t('format')}</button>
    </div>
    {(boxes.length > 0 || formatting) && <label>{t('edit')}<Dropdown value={target} onChange={value => onSelect(value as SceneTextTarget)} options={targets} /></label>}
    {selected && <label>{t('box', { number: index + 1 })}<textarea rows={2} maxLength={MAX_SCENE_TEXT_LENGTH} value={selected.text}
      onChange={event => {
        const { value, selectionEnd } = event.currentTarget;
        edit(current => updateBoxText(current, selected.key, value, selectionEnd), `textBox-${selected.key}-text`);
      }} /></label>}
    {formatting && <div className="canvas-text-tools canvas-text-format" role="group" aria-label={t('format')}>
      <label>{t('align')}<Dropdown value={format.align ?? 'center'} onChange={value => onFormat({ align: value as SceneTextStyle['align'] })}
        options={SCENE_TEXT_ALIGNMENTS.map(value => ({ value, label: t(value) }))} /></label>
      <label>{t('vertical')}<Dropdown value={format.verticalAlign ?? 'top'} onChange={value => onFormat({ verticalAlign: value as SceneTextStyle['verticalAlign'] })}
        options={SCENE_TEXT_VERTICAL_ALIGNMENTS.map(value => ({ value, label: t(value) }))} /></label>
      <label>{t('size')}<Dropdown value={format.size ?? defaultSize} onChange={value => onFormat({ size: value as SceneTextStyle['size'] })}
        options={SCENE_TEXT_SIZES.map(value => ({ value, label: t(value) }))} /></label>
      <label>{t('lines')}<NumberSetting key={target} value={format.lines} min={1} max={32} placeholder={t('auto')} onChange={lines => onFormat({ lines })} /></label>
      <label>{t('wrap')}<Dropdown value={format.wrap ?? 'break-word'} onChange={value => onFormat({ wrap: value as SceneTextStyle['wrap'] })}
        options={SCENE_TEXT_WRAPS.map(value => ({ value, label: t(value) }))} /></label>
      <label>{t('overflow')}<Dropdown value={format.overflow ?? 'visible'} onChange={value => onFormat({ overflow: value as SceneTextStyle['overflow'] })}
        options={SCENE_TEXT_OVERFLOWS.map(value => ({ value, label: t(value) }))} /></label>
      <CharacterTools key={target} format={format} onFormat={onFormat} />
      {selected && <div className="canvas-text-order">
        <button type="button" className="small-button" disabled={index <= 0} onClick={() => move(-1)}>{t('up')}</button>
        <button type="button" className="small-button" disabled={index >= boxes.length - 1} onClick={() => move(1)}>{t('down')}</button>
        <button type="button" className="small-button danger-outline" onClick={() => setRemoving(selected.key)}>{t('remove')}</button>
        {removing === selected.key && <ConfirmDialog title={t('removeTitle')} text={t('removeText')} confirm={t('remove')}
          onConfirm={() => {
            setRemoving(undefined);
            edit(current => setSceneTextBoxes(current, boxes.filter(box => box.key !== selected.key)), 'textBoxes');
            onSelect('promptStyle');
          }} onCancel={() => setRemoving(undefined)} />}
      </div>}
    </div>}
  </div>;
}

const characterToggles = ['bold', 'italic', 'underline', 'strike'] as const;
function CharacterFlags({ format, onFormat, compact, keys = characterToggles }: {
  format: SceneCharacterStyle; onFormat: (patch: SceneCharacterStyle) => void; compact?: boolean; keys?: readonly (typeof characterToggles)[number][];
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  return keys.map(key => {
    const pressed = format[key] ?? key === 'bold';
    return <button type="button" className="small-button" key={key} aria-pressed={pressed}
      aria-label={compact ? t(key) : undefined} title={compact ? t(key) : undefined}
      onClick={() => onFormat({ [key]: !pressed })}>
      {compact ? <span aria-hidden="true" className={`character-icon character-${key}`}>{({ bold: 'B', italic: 'I', underline: 'U', strike: 'S' })[key]}</span> : t(key)}
    </button>;
  });
}

function CharacterTools({ format, onFormat }: {
  format: SceneCharacterStyle; onFormat: (format: SceneCharacterStyle | null) => void;
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  const fonts = useTexts(LOOK_TEXTS);
  return <>
    <label>{t('font')}<Dropdown value={format.font ?? ''} onChange={value => onFormat({ font: (value || undefined) as SceneCharacterStyle['font'] })}
      options={[{ value: '', label: t('followTheme') }, ...SCENE_TEXT_FONTS.map(value => ({ value, label: fonts(fontNames[value]) }))]} /></label>
    <label>{t('scale')}<NumberSetting value={format.scale} min={50} max={200} placeholder="100" onChange={scale => onFormat({ scale })} /></label>
    <label>{t('color')}<input type="color" value={format.color ?? '#ffffff'} onChange={event => onFormat({ color: event.currentTarget.value })} /></label>
    {format.color && <button type="button" className="small-button" onClick={() => onFormat({ color: undefined })}>{t('themeColor')}</button>}
    <div className="canvas-character-choices"><CharacterFlags compact format={format} onFormat={onFormat} />
      <button type="button" className="small-button" onClick={() => onFormat(null)}>{t('reset')}</button>
    </div>
  </>;
}

function NumberSetting({ value, min, max, placeholder, label, onChange }: {
  value: number | undefined; min: number; max: number; placeholder: string; label?: string; onChange: (value: number | undefined) => void;
}) {
  return <input key={value} type="number" min={min} max={max} step={1} defaultValue={value} placeholder={placeholder} aria-label={label}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    onBlur={event => {
      const field = event.currentTarget;
      if (!field.validity.valid) field.value = value === undefined ? '' : String(value);
      else if (field.value) onChange(field.valueAsNumber);
      else onChange(undefined);
    }} />;
}

interface TextSelection { start: number; end: number; x: number; top: number; bottom: number }

export function CanvasText({ value, label, onChange, onMarks, onFocus, readOnly, format, main, title }: {
  value: string; label: string; onChange: (value: string, caret: number) => void;
  onMarks?: ((marks: SceneTextMark[]) => void) | undefined; onFocus?: () => void;
  readOnly: boolean; format?: SceneTextStyle | undefined; main?: boolean; title?: boolean;
}) {
  const t = useTexts(TEXT_BOX_TEXTS);
  const field = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(0);
  const [more, setMore] = useState(false);
  const fonts = useTexts(LOOK_TEXTS);
  const tools = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TextSelection>();
  const [focused, setFocused] = useState(false);
  const [sized, setSized] = useState(false);
  const showingTools = Boolean(selection);
  useEffect(() => {
    const element = field.current;
    if (!main || !element || sized) return;
    const watch = new MutationObserver(() => { if (element.style.height) setSized(true); });
    watch.observe(element, { attributes: true, attributeFilter: ['style'] });
    return () => watch.disconnect();
  }, [main, sized]);
  useEffect(() => {
    if (!showingTools) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (target !== field.current && !tools.current?.contains(target)) dismiss();
    };
    const dismiss = () => { setSelection(undefined); setMore(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    const canvas = field.current?.closest('.scene-stage');
    canvas?.addEventListener('scroll', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      canvas?.removeEventListener('scroll', dismiss);
    };
  }, [showingTools]);

  const { className: typography, style } = sceneTextProps(format, title ? 'heading' : 'body');
  const marks = format?.marks ?? [];
  const useFixedHeight = Boolean(format?.lines);
  const vertical = useFixedHeight ? format?.verticalAlign : undefined;
  useLayoutEffect(() => {
    const element = field.current;
    const shadow = mirror.current;
    if (!element || !shadow || vertical === undefined || vertical === 'top') return;
    const align = () => {
      shadow.style.inlineSize = `${element.clientWidth}px`;
      const available = Math.max(0, element.clientHeight - shadow.offsetHeight);
      setInset(vertical === 'middle' ? available / 2 : available);
    };
    const watch = new ResizeObserver(align);
    align();
    watch.observe(shadow);
    watch.observe(element);
    return () => watch.disconnect();
  }, [vertical, value]);
  const offset = vertical && vertical !== 'top' ? inset : 0;
  const showReading = Boolean(value && (selection || marks.length || format?.lines || format?.wrap || format?.overflow));
  const captureSelection = (element: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end } = element;
    if (!onMarks || readOnly || start === end || document.activeElement !== element) {
      setSelection(undefined);
      setMore(false);
      return;
    }
    const shadow = mirror.current;
    const rect = element.getBoundingClientRect();
    if (shadow) shadow.style.inlineSize = `${element.clientWidth}px`;
    const text = shadow?.firstChild;
    const range = text?.nodeType === Node.TEXT_NODE ? document.createRange() : undefined;
    if (range && text) {
      const length = text.textContent?.length ?? 0;
      range.setStart(text, Math.min(start, length));
      range.setEnd(text, Math.min(end, length));
    }
    const line = range?.getBoundingClientRect();
    const x = line ? (line.left + line.right) / 2 - element.scrollLeft : rect.left + rect.width / 2;
    const dy = offset - element.scrollTop;
    setSelection({ start, end, x, top: Math.max(rect.top, (line?.top ?? rect.top) + dy), bottom: Math.min(rect.bottom, (line?.bottom ?? rect.bottom) + dy) });
  };
  const shortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!selection) return;
    const command = event.key.toLowerCase();
    if (event.key === 'Escape') { event.stopPropagation(); setSelection(undefined); setMore(false); }
    else if (event.altKey && event.key === 'F10') { event.preventDefault(); tools.current?.querySelector('select')?.focus(); }
    else if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(command)) {
      event.preventDefault();
      const key = command === 'b' ? 'bold' : command === 'i' ? 'italic' : 'underline';
      onMarks?.(formatSelection(marks, selection, { [key]: !(selectedStyle[key] ?? key === 'bold') }));
    }
  };
  const firstMark = selection && marks.find(mark => mark.start <= selection.start && mark.end > selection.start);
  const selectedStyle = { ...format, ...firstMark };
  const portal = field.current?.closest('.editor');
  const width = Math.min(456, window.innerWidth - 16);
  const left = selection && Math.max(8, Math.min(selection.x - width / 2, window.innerWidth - width - 8));
  // Put the toolbar above the highlight when there is room and flip below near the top.
  const above = selection && selection.top >= (more ? 145 : 76);
  const toolbarPosition = selection && (above
    ? { bottom: window.innerHeight - selection.top + 8, maxHeight: selection.top - 16 }
    : { top: selection.bottom + 8, maxHeight: window.innerHeight - selection.bottom - 16 });
  const formatSelected = (patch: SceneCharacterStyle | null) => {
    if (selection) onMarks?.(formatSelection(marks, selection, patch));
  };
  return <div className={`canvas-text-box scene-text-mirror ${typography}`} data-text={value || label} data-sized={sized && !useFixedHeight || undefined}
    data-fixed={useFixedHeight || undefined} data-reading={showReading && (!focused || readOnly) || undefined} style={style}>
    <div ref={mirror} className={`${typography} canvas-text-anchor`} aria-hidden="true">{value}<span>{'\u200b'}</span></div>
    {showReading && <div className={`${typography} canvas-text-reading`} aria-hidden="true">
      <SceneTextContent text={value} format={format} selection={selection} />
    </div>}
    <textarea ref={field} className={`${typography} ${main ? 'canvas-prompt' : title ? 'tv-banner canvas-title' : 'canvas-extra-text'}`} rows={1}
      aria-label={label} placeholder={label} value={value} readOnly={readOnly} maxLength={title ? MAX_SCENE_TITLE_LENGTH : MAX_SCENE_TEXT_LENGTH}
      wrap={format?.wrap === 'none' ? 'off' : 'soft'} style={offset ? { paddingBlockStart: offset } : undefined}
      onFocus={() => { setFocused(true); onFocus?.(); }} onBlur={() => setFocused(false)}
      onKeyDown={shortcut} onSelect={event => captureSelection(event.currentTarget)}
      onPointerUp={event => { if (event.button === 0) captureSelection(event.currentTarget); }}
      onContextMenu={event => {
        if (readOnly || !onMarks || event.currentTarget.selectionStart === event.currentTarget.selectionEnd) return;
        event.preventDefault();
        captureSelection(event.currentTarget);
        tools.current?.querySelector('select')?.focus();
      }}
      onChange={event => { setSelection(undefined); setMore(false); onChange(event.target.value, event.target.selectionEnd); }} />
    {selection && portal && createPortal(<div ref={tools} className="canvas-selection-tools" role="group"
      aria-label={t('selection')} style={{ width, left, ...toolbarPosition }}
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation(); field.current?.focus(); setSelection(undefined); setMore(false);
      }}
      onBlur={event => {
        if (!event.relatedTarget || event.relatedTarget === field.current || event.currentTarget.contains(event.relatedTarget)) return;
        setSelection(undefined); setMore(false);
      }}>
      <div className="canvas-selection-row">
        <select aria-label={t('font')} title={t('font')} value={selectedStyle.font ?? ''} onChange={event =>
          formatSelected({ font: (event.target.value || undefined) as SceneCharacterStyle['font'] })}>
          <option value="">{t('followTheme')}</option>
          {SCENE_TEXT_FONTS.map(value => <option key={value} value={value}>{fonts(fontNames[value])}</option>)}
        </select>
        <span className="canvas-selection-size" title={t('scale')}>
          <NumberSetting value={selectedStyle.scale} min={50} max={200} placeholder="100" label={t('scale')} onChange={scale => formatSelected({ scale })} />
        </span>
        <div className="canvas-selection-flags">
          <CharacterFlags compact keys={['bold', 'italic', 'underline']} format={selectedStyle} onFormat={formatSelected} />
        </div>
        <label className="canvas-selection-color" title={t('color')}>
          <span aria-hidden="true" style={{ borderColor: selectedStyle.color ?? 'currentColor' }}>A</span>
          <input type="color" aria-label={t('color')} value={selectedStyle.color ?? '#ffffff'}
            onChange={event => formatSelected({ color: event.currentTarget.value })} />
        </label>
        <button type="button" aria-label={t('more')} title={t('more')} aria-expanded={more} onClick={() => setMore(!more)}>⋯</button>
      </div>
      {more && <div className="canvas-selection-more">
        <CharacterFlags keys={['strike']} format={selectedStyle} onFormat={formatSelected} />
        {selectedStyle.color && <button type="button" onClick={() => formatSelected({ color: undefined })}>{t('themeColor')}</button>}
        <button type="button" onClick={() => formatSelected(null)}>{t('reset')}</button>
      </div>}
    </div>, portal)}
  </div>;
}
