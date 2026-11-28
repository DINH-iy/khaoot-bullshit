import type { CSSProperties, ReactNode } from 'react';
import { DEFAULT_MEDIA_LAYOUT, type MediaLayout } from '@party/contracts';
import './scene-composition.css';

export function SceneComposition({ layout = DEFAULT_MEDIA_LAYOUT, media, children }: { layout?: MediaLayout | undefined; media?: ReactNode; children: ReactNode }) {
  const style = {
    '--image-width': layout.imageWidth === undefined ? undefined : `${layout.imageWidth}%`,
    '--image-rotation': layout.imageRotation ? `${layout.imageRotation}deg` : undefined,
  } as CSSProperties;
  const mediaSlot = media && <div key="media" className="composition-media">{media}</div>;
  return <div data-image-width={layout.imageWidth !== undefined || undefined} style={style} className={`scene-composition media-${layout.position} media-${layout.size}`}>
    <div className={`scene-composition-body${media ? ' has-media' : ''}`}>
      {layout.position === 'above' && mediaSlot}
      <div key="copy" className="composition-copy">{children}</div>
      {layout.position !== 'above' && mediaSlot}
    </div>
  </div>;
}
