import type { FeedbackItem, PickedElement } from '@party/contracts';

const KIND: Record<FeedbackItem['kind'], string> = { bug: 'Bug', feature: 'Feature request', minigame: 'Minigame idea' };
export const STATUS: Record<FeedbackItem['status'], string> = { new: 'New', planned: 'Planned', in_progress: 'In progress', done: 'Done', declined: 'Declined' };
export const kindLabel = (kind: FeedbackItem['kind']) => KIND[kind];

/** "Component@folder/file.tsx:12" as a path from the project root. */
export const sourcePath = (source: string) => { const at = source.lastIndexOf('@'); return `${at >= 0 ? `${source.slice(0, at)} in ` : ''}apps/web/src/${source.slice(at + 1)}`; };

function elementLine(element: PickedElement): string {
  const name = element.label || element.text || '(no text)';
  const lines = [`- "${name}" <${element.tag}>${element.source ? ` at ${sourcePath(element.source)}` : ''}`];
  if (element.sources.length) lines.push(`  inside: ${element.sources.map(sourcePath).join(' → ')}`);
  lines.push(`  selector: ${element.selector}`);
  return lines.join('\n');
}

/** A plain-text version of a report to paste into a request to fix or build it. */
export function feedbackText(item: FeedbackItem): string {
  const { context } = item;
  const lines = [
    `## ${KIND[item.kind]}: ${item.title} (${STATUS[item.status].toLowerCase()})`,
    `Reported ${item.createdAt.slice(0, 16).replace('T', ' ')}${item.reporterName ? ` by ${item.reporterName}` : ''} on the ${context.screen} (${context.page}, ${context.viewport.width}×${context.viewport.height}).`,
    `Browser: ${context.userAgent}`,
  ];
  if (item.details) lines.push('', item.details);
  if (context.elements.length) lines.push('', 'Pointed at:', ...context.elements.map(elementLine));
  if (item.ownerNote) lines.push('', `Owner note: ${item.ownerNote}`);
  return lines.join('\n');
}
