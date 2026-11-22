import { useEffect } from 'react';
import { FONTS, fontAssetUrl, type FullTheme, type ThemeFont } from '@party/contracts';

const familyName = (id: string) => `party-font-${id}`;
export const fontCssFamily = (font: ThemeFont) => typeof font === 'string' ? FONTS[font] : `"${familyName(font.id)}", ${FONTS.system}`;

const loading = new Set<string>();
function loadFont(id: string) {
  if (typeof FontFace !== 'function' || !document.fonts || loading.has(id)) return;
  const face = new FontFace(familyName(id), `url("${fontAssetUrl(id)}")`, { display: 'swap' });
  loading.add(id);
  document.fonts.add(face);
  void face.load().catch(() => {
    document.fonts.delete(face);
    loading.delete(id);
  });
}

export function useThemeFonts({ font, headingFont }: Pick<FullTheme, 'font' | 'headingFont'>) {
  const bodyId = typeof font === 'string' ? undefined : font.id;
  const titleId = typeof headingFont === 'string' ? undefined : headingFont.id;
  useEffect(() => {
    if (bodyId) loadFont(bodyId);
    if (titleId) loadFont(titleId);
  }, [bodyId, titleId]);
}
