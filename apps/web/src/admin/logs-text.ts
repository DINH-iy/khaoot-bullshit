import type { LogDetail, ServerProblem } from '@party/contracts';

const server = (problem: ServerProblem) => [`${problem.message}`, `  at ${problem.where} (asked by ${problem.actor})`, ...problem.stack.map(line => `  ${line}`)].join('\n');

/** A log as plain text, to paste into a bug report or a chat with an AI that helps fix it. */
export function logText(log: LogDetail): string {
  const lines = [`${log.reason} · ${log.summary}`, `${log.createdAt} · ${log.who}${log.place ? ` · ${log.place}` : ''}${log.sessionId ? ` · room ${log.sessionId}` : ''}${log.requestId ? ` · request ${log.requestId}` : ''}`];
  if (log.server) lines.push('', server(log.server));
  if (log.device) lines.push(`Device ${log.device.id} · ${log.device.role} · ${log.device.viewport.width}×${log.device.viewport.height} · ${log.device.userAgent}`);
  if (log.stats) {
    const { requests, heartbeat, longTasks, reconnects } = log.stats;
    lines.push(`Answers: ${requests ? `median ${requests.median} ms, max ${requests.max} ms, ${requests.count}` : 'none'} · heartbeat: ${heartbeat ? `median ${heartbeat.median} ms, max ${heartbeat.max} ms` : 'none'} · busy page: ${longTasks ? `${longTasks.count}×, longest ${longTasks.max} ms` : 'not measured'} · reconnects: ${reconnects}`);
  }
  for (const related of log.related) lines.push('', `Server, ${related.createdAt}${related.requestId ? ` (request ${related.requestId})` : ''}:`, server(related.server));
  if (log.events.length) {
    lines.push('', 'Events (oldest first):');
    for (const event of log.events) lines.push(`${new Date(event.at).toISOString().slice(11, 23)}  ${event.kind.padEnd(10)} ${event.what}${event.n ? ` ×${event.n}` : ''}${event.code ? ` → ${event.code}` : ''}${event.ms !== undefined ? ` (${event.ms} ms)` : ''}${event.requestId ? ` [${event.requestId.slice(0, 8)}]` : ''} · ${event.screen}`);
  }
  return lines.join('\n');
}
