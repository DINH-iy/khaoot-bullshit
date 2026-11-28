import { z } from 'zod';
import { GameKeySchema } from './game-key.js';
import { FONTS, type FontName } from './presentation.js';

export const MAX_SCENE_TEXT_BOXES = 8;
export const SCENE_TEXT_GRID_COLUMNS = 12;
export const MAX_SCENE_TEXT_LINES = 32;
export const MAX_SCENE_TEXT_LENGTH = 2000;
export const SCENE_TEXT_SIZES = ['heading', 'body', 'small'] as const;
export const SCENE_TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const;
export const SCENE_TEXT_VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const;
export const MAX_SCENE_TITLE_LENGTH = 120;
export const SceneTitleSchema = z.string().max(MAX_SCENE_TITLE_LENGTH).regex(/\S/);
export const ScenePromptSchema = z.string().max(MAX_SCENE_TEXT_LENGTH).regex(/\S/);
export const SCENE_TEXT_OVERFLOWS = ['visible', 'clip', 'scroll'] as const;
export const SCENE_TEXT_WRAPS = ['break-word', 'word', 'none'] as const;
export const SCENE_TEXT_FONTS = Object.keys(FONTS) as FontName[];
const characterStyle = {
  font: z.enum(SCENE_TEXT_FONTS).optional(),
  scale: z.number().int().min(50).max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
};
const mark = z.object({
  start: z.number().int().min(0).max(MAX_SCENE_TEXT_LENGTH - 1),
  end: z.number().int().min(1).max(MAX_SCENE_TEXT_LENGTH),
  ...characterStyle,
}).strict();
const marks = z.array(mark).max(MAX_SCENE_TEXT_LENGTH)
  .refine(ranges => ranges.every((range, index) => range.start < range.end && (index === 0 || ranges[index - 1]!.end <= range.start)),
    'Text formatting ranges must be ordered and non-overlapping.');
export type SceneTextMark = z.infer<typeof mark>;
export type SceneCharacterStyle = Omit<SceneTextMark, 'start' | 'end'>;

export const SceneTextStyleSchema = z.object({
  size: z.enum(SCENE_TEXT_SIZES).optional(),
  align: z.enum(SCENE_TEXT_ALIGNMENTS).optional(),
  verticalAlign: z.enum(SCENE_TEXT_VERTICAL_ALIGNMENTS).optional(),
  ...characterStyle,
  marks: marks.optional(),
  wrap: z.enum(SCENE_TEXT_WRAPS).optional(),
  overflow: z.enum(SCENE_TEXT_OVERFLOWS).optional(),
  lines: z.number().int().min(1).max(MAX_SCENE_TEXT_LINES).optional(),
}).strict();
export type SceneTextStyle = z.infer<typeof SceneTextStyleSchema>;
const SceneTextBoxLayoutSchema = z.object({
  width: z.number().int().min(1).max(SCENE_TEXT_GRID_COLUMNS).optional(),
  startColumn: z.number().int().min(1).max(SCENE_TEXT_GRID_COLUMNS).optional(),
  newRow: z.boolean().optional(),
  rotation: z.number().int().min(-180).max(180).optional(),
}).strict().refine(layout => (layout.startColumn ?? 1) + (layout.width ?? SCENE_TEXT_GRID_COLUMNS) - 1 <= SCENE_TEXT_GRID_COLUMNS,
  'This text box extends beyond its row.');
export type SceneTextBoxLayout = z.infer<typeof SceneTextBoxLayoutSchema>;
export const SceneTextBoxesSchema = z.array(z.object({
  key: GameKeySchema,
  text: z.string().max(MAX_SCENE_TEXT_LENGTH),
  source: z.literal('places').optional(),
  layout: SceneTextBoxLayoutSchema.optional(),
  ...SceneTextStyleSchema.shape,
}).strict()).max(MAX_SCENE_TEXT_BOXES)
  .refine(boxes => new Set(boxes.map(box => box.key)).size === boxes.length, 'Text box keys must be unique.');
export type SceneTextBox = z.infer<typeof SceneTextBoxesSchema>[number];
