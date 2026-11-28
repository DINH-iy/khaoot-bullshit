import type { SessionView } from '@party/contracts';
import { withAnswerTranslation, withoutMarks } from './scene-text.js';
import type { Language } from '../i18n/language.js';

type Stage = NonNullable<SessionView['stage']>;

/** Translate display labels while keeping all answer keys and round state intact. */
export function localizeStage(stage: Stage, language: Language): Stage {
  const translation = stage.translations?.[language];
  if (!translation) return stage;
  const label = ({ key, label }: { key: string; label: string }) =>
    Object.hasOwn(translation.labels ?? {}, key) ? translation.labels![key]! : label;
  const input = stage.input;
  return {
    ...stage,
    prompt: translation.prompt ?? stage.prompt,
    promptStyle: translation.prompt && translation.prompt !== stage.prompt ? withoutMarks(stage.promptStyle) : stage.promptStyle,
    titleStyle: translation.title && translation.title !== stage.info?.title ? withoutMarks(stage.titleStyle) : stage.titleStyle,
    info: stage.info && { ...stage.info, title: translation.title ?? stage.info.title },
    explain: stage.explain && { ...stage.explain, text: translation.explanation ?? stage.explain.text },
    input: input?.kind === 'choice' ? { ...input, options: input.options.map(option => withAnswerTranslation(option, label(option))) }
      : input?.kind === 'order' ? { ...input, items: input.items.map(item => ({ ...item, label: label(item) })) } : input,
    route: stage.route && { ...stage.route, options: stage.route.options.map(option => ({ ...option, label: label(option) })) },
  };
}
