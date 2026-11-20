export { Icon } from '../../presentation/line-icons.js';

/** The icon for a scene card, from its first part. */
export const sceneIcon = (kind: string, input: string | null) => kind === 'collect' ? ({ choice: 'quiz', text: 'writing', media: 'upload', order: 'order', drawing: 'drawing' } as Record<string, string>)[input ?? ''] ?? 'quiz' : kind;
