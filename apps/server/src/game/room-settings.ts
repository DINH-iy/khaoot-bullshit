import { GAME_LOCKED_SETTINGS, type MinigameKey, type MinigameSettings } from '@party/contracts';
import type { GameDefinition } from './definition.js';

// A game's own room settings (`room` in its definition): the values a new room of it starts with,
// and which of them the host can no longer change once the game has started.

export type LockedSetting = typeof GAME_LOCKED_SETTINGS[number];

/**
 * What a new room of this game starts with, on top of the room's standard settings, and `gameLocks`:
 * the round-closing rule, when the game sets it, stays as the game set it once the game has started
 * (the owner's decision of 25 November 2026). A game that leaves it out locks nothing.
 */
export function startingRoomSettings(definition: Pick<GameDefinition, 'room'>) {
  const room = Object.fromEntries(Object.entries(definition.room ?? {}).filter(([, value]) => value !== undefined));
  const gameLocks: LockedSetting[] = GAME_LOCKED_SETTINGS.some(key => key in room) ? [...GAME_LOCKED_SETTINGS] : [];
  return { ...room, gameLocks };
}

/** The settings the host cannot change now: none in the lobby, the game's locks from the start on. */
export const lockedRoomSettings = (state: { gameLocks: readonly LockedSetting[] }, status: string): LockedSetting[] =>
  status === 'LOBBY' ? [] : [...state.gameLocks];

/**
 * A minigame's settings with the host's own words for this room (stored with the room's state, rooms/reclaim.ts):
 * Galgje plays the host's words, Undercover the host's pairs, instead of the scene's. Other games are unchanged.
 */
export function withRoomWords(game: MinigameKey, settings: MinigameSettings, roomState: unknown): MinigameSettings {
  const own = (roomState as { ownWords?: { words?: unknown; pairs?: unknown } } | null)?.ownWords;
  const words = Array.isArray(own?.words) ? own.words.filter((word): word is string => typeof word === 'string') : [];
  const pairs = Array.isArray(own?.pairs) ? own.pairs.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2) : [];
  if (game === 'hangman' && words.length) return { ...settings, words } as MinigameSettings;
  if (game === 'undercover' && pairs.length) return { ...settings, pairs } as MinigameSettings;
  return settings;
}
