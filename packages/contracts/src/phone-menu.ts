import { z } from 'zod';

export const PHONE_MENU_DEFAULTS = {
  scores: 'scoreboard', players: 'teams', chat: 'chat', react: 'smile', break: 'pause',
  games: 'minigame', challenge: 'duel', sound: 'sound', effects: 'gear',
  birthday: 'cake', leave: 'exit', language: 'globe',
  slots: 'reels', blackjack: 'cards', roulette: 'wheel', coin: 'coin', packs: 'gift', leaderboard: 'bars',
} as const;
export type PhoneMenuAction = keyof typeof PHONE_MENU_DEFAULTS;
export const PHONE_MENU_ACTIONS = Object.keys(PHONE_MENU_DEFAULTS) as PhoneMenuAction[];
export const PHONE_MENU_GLYPHS = [...Object.values(PHONE_MENU_DEFAULTS), 'phone', 'star', 'sparkles', 'flag', 'heart'] as const;
export const PhoneMenuGlyphSchema = z.enum(PHONE_MENU_GLYPHS);
export const PhoneMenuIconsSchema = z.partialRecord(z.enum(PHONE_MENU_ACTIONS), PhoneMenuGlyphSchema);
export type PhoneMenuIcons = z.infer<typeof PhoneMenuIconsSchema>;
