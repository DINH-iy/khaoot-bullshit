import { z } from 'zod';

/**
 * Feedback from people trying the test version: bug reports, feature requests
 * and minigame ideas. Anyone can send one (players need no account); only the
 * owner reads and manages them in the admin menu.
 */
export const FEEDBACK_KINDS = ['bug', 'feature', 'minigame'] as const;
export const FeedbackKindSchema = z.enum(FEEDBACK_KINDS);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FEEDBACK_STATUSES = ['new', 'planned', 'in_progress', 'done', 'declined'] as const;
export const FeedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

/** Strings from a browser: printable text only, bounded. */
const text = (max: number) => z.string().max(max).transform(value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ''));

/**
 * An element the reporter pointed at. `source` is where it is written in the web
 * app ("Component@folder/file.tsx:line"), tagged into the build; `sources` adds
 * the enclosing elements' locations, innermost first.
 */
export const PickedElementSchema = z.object({
  source: text(200).nullable(),
  sources: z.array(text(200)).max(6),
  selector: text(400),
  tag: text(40),
  text: text(160),
  label: text(160),
}).strict();
export type PickedElement = z.infer<typeof PickedElementSchema>;

export const FeedbackContextSchema = z.object({
  /** Path and the harmless query parameters only; never the hash (it can hold the owner key). */
  page: text(300),
  screen: text(60),
  viewport: z.object({ width: z.number().int().min(0).max(20_000), height: z.number().int().min(0).max(20_000) }).strict(),
  userAgent: text(300),
  elements: z.array(PickedElementSchema).max(5),
}).strict();
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

export const FEEDBACK_TITLE_MAX = 140;
export const FEEDBACK_DETAILS_MAX = 4000;
export const NewFeedbackSchema = z.object({
  /** Chosen by the browser once per report, so a retried send is stored once. */
  id: z.uuid(),
  kind: FeedbackKindSchema,
  title: text(FEEDBACK_TITLE_MAX).pipe(z.string().trim().min(3)),
  details: text(FEEDBACK_DETAILS_MAX).pipe(z.string().trim()),
  reporterName: text(60).pipe(z.string().trim()).nullable(),
  context: FeedbackContextSchema,
}).strict();
export type NewFeedback = z.input<typeof NewFeedbackSchema>;

export const FeedbackItemSchema = z.object({
  id: z.uuid(),
  kind: FeedbackKindSchema,
  status: FeedbackStatusSchema,
  title: z.string(),
  details: z.string(),
  reporterName: z.string().nullable(),
  context: FeedbackContextSchema,
  ownerNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;
export const FeedbackListSchema = z.object({ items: z.array(FeedbackItemSchema) }).strict();
export type FeedbackList = z.infer<typeof FeedbackListSchema>;

/** What the owner can change on a report. */
export const FeedbackUpdateSchema = z.object({
  kind: FeedbackKindSchema.optional(),
  status: FeedbackStatusSchema.optional(),
  ownerNote: text(2000).pipe(z.string().trim()).nullable().optional(),
}).strict().refine(update => Object.keys(update).length > 0, 'Nothing to change');
export type FeedbackUpdate = z.input<typeof FeedbackUpdateSchema>;
