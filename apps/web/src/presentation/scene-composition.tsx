import type { ReactNode } from 'react';
import { DEFAULT_MEDIA_LAYOUT, type MediaLayout } from '@party/contracts';
import './scene-composition.css';

export function SceneComposition({ layout = DEFAULT_MEDIA_LAYOUT, media, children }: { layout?: MediaLayout | undefined; media?: ReactNode; children: ReactNode }) {
  return <div className={`scene-composition media-${layout.position} media-${layout.size}`}>
    <div className={`scene-composition-body${media ? ' has-media' : ''}`}>
      {layout.position === 'above' && media && <div className="composition-media">{media}</div>}
      <div className="composition-copy">{children}</div>
      {layout.position !== 'above' && media && <div className="composition-media">{media}</div>}
    </div>
  </div>;
}
