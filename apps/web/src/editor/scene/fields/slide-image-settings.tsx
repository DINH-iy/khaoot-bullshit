import { useState } from 'react';
import { MAX_SLIDE_IMAGES, type SlideImage } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { Dropdown } from '../../../ui/dropdown.js';
import { ConfirmDialog } from '../../controls/confirm-dialog.js';
import { NumberSetting } from '../../controls/number-setting.js';
import { uniqueKey, type Stage } from '../../model.js';
import { sceneSlideImages, setSlideImages, updateSlideImage } from '../slide-image-edits.js';
import { MediaLibraryDialog } from './media-field.js';
import { SLIDE_IMAGE_TEXTS } from './slide-images.text.js';

const fields = [
  { name: 'x', min: 0, max: 100, step: 0.1 },
  { name: 'y', min: 0, max: 100, step: 0.1 },
  { name: 'width', min: 2, max: 100, step: 0.1 },
  { name: 'rotation', min: -180, max: 180, step: 1 },
] as const;

export function SlideImageSettings({ stage, selected, select, edit }: {
  stage: Stage; selected: string | undefined; select: (key?: string) => void;
  edit: (change: (stage: Stage) => Stage, field: string) => void;
}) {
  const t = useTexts(SLIDE_IMAGE_TEXTS);
  const images = sceneSlideImages(stage);
  const index = images.findIndex(image => image.key === selected);
  const picture = images[index];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const change = (image: SlideImage, patch: Partial<SlideImage>) =>
    edit(current => updateSlideImage(current, image.key, patch), `slide-image-${image.key}`);
  const reorder = (direction: -1 | 1) => {
    if (!picture) return;
    const next = [...images];
    next.splice(index, 1);
    next.splice(index + direction, 0, picture);
    edit(current => setSlideImages(current, next), 'slide-image-order');
  };
  return <fieldset className="slide-image-settings"><legend>{t('images')}</legend>
    <button type="button" className="small-button" aria-haspopup="dialog" disabled={images.length >= MAX_SLIDE_IMAGES}
      onClick={() => setAdding(true)}>+ {t('add')}</button>
    {images.length > 0 && <label>{t('select')}<Dropdown value={picture?.key ?? ''} placeholder={t('select')} onChange={select}
      options={images.map((image, index) => ({ value: image.key, label: image.alt?.trim() || t('picture', { number: index + 1 }) }))} /></label>}
    {picture && <>
      <div className="slide-image-values">
        {fields.map(({ name, min, max, step }) => <label key={name}>{t(name)}
          <NumberSetting key={picture.key} value={picture[name]} min={min} max={max} step={step} placeholder={String(picture[name])}
            onChange={value => { if (value !== undefined) change(picture, { [name]: value }); }} />
        </label>)}
      </div>
      <label>{t('alt')}<input value={picture.alt ?? ''} maxLength={200}
        onChange={event => change(picture, { alt: event.target.value || undefined })} /></label>
      <div className="canvas-text-tools">
        <button type="button" className="small-button" disabled={index === images.length - 1} onClick={() => reorder(1)}>{t('forward')}</button>
        <button type="button" className="small-button" disabled={index === 0} onClick={() => reorder(-1)}>{t('backward')}</button>
        <button type="button" className="small-button danger-outline" onClick={() => setRemoving(picture.key)}>{t('remove')}</button>
      </div>
    </>}
    {removing && <ConfirmDialog title={t('removeTitle')} text={t('removeHint')} confirm={t('remove')} onCancel={() => setRemoving(undefined)}
      onConfirm={() => {
        edit(current => setSlideImages(current, sceneSlideImages(current).filter(image => image.key !== removing)), 'slide-images');
        if (selected === removing) select();
        setRemoving(undefined);
      }} />}
    {adding && <MediaLibraryDialog only="image" onClose={() => setAdding(false)} onPick={item => {
      const key = uniqueKey('picture', images.map(image => image.key));
      const offset = images.length % 4 * 7;
      edit(current => setSlideImages(current, [...sceneSlideImages(current),
        { key, id: item.id, x: 65 - offset, y: 48 + offset, width: 25, rotation: 0 }]), 'slide-images');
      select(key);
      setAdding(false);
    }} />}
  </fieldset>;
}
