import { z } from 'zod';

export const FONT_FILE_MAX = 10 * 1024 * 1024;
export const FONT_FILE_ACCEPT = '.woff2,.woff,.ttf,.otf,application/font-woff,font/woff2,font/woff,font/ttf,font/otf';
export const UploadedFontSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(120) }).strict();
export type UploadedFont = z.infer<typeof UploadedFontSchema>;
export const FontUploadResultSchema = UploadedFontSchema.extend({ alreadyPresent: z.literal(true).optional() });
export type FontUploadResult = z.infer<typeof FontUploadResultSchema>;
export const FontLibrarySchema = z.array(UploadedFontSchema);
export const GoogleFontImportSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
export const fontAssetUrl = (id: string) => `/api/fonts/${id}`;
