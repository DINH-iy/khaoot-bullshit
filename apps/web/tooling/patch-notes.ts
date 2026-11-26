import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';
import { COMMIT_NOTES_PATH, type PatchNoteDay } from '../src/patch-notes/updates.js';

const git = promisify(execFile);
const repository = fileURLToPath(new URL('../../../', import.meta.url));
// The last commit described by the hand-written history.
const baseline = '39aa19b124a65429ff6a790b0685c55876ae02ed';

const areas: [RegExp, string][] = [
  [/^apps\/web\/src\/patch-notes\/|^apps\/web\/tooling\/patch-notes\.ts$/, 'patch notes'],
  [/\/src\/(?:editor|authoring)\//, 'the game editor'],
  [/\/src\/arcade\//, 'Arcade'],
  [/\/src\/(?:minigames|head-to-head|side-games)\//, 'minigames and side games'],
  [/\/src\/(?:room|rooms|room-extras|hosting|game)\//, 'hosting and live games'],
  [/\/src\/(?:presentation|drawing|players|i18n)\//, 'the player experience'],
  [/\/src\/(?:admin|people|diagnostics|owner|feedback)\//, 'admin and player accounts'],
  [/\/src\/assets\//, 'the media library'],
  [/^apps\/server\/database\//, 'database storage'],
  [/^packages\/contracts\//, 'shared game rules and data'],
  [/^docs\/|^(?:README|APP_PLAN|AGENTS)\.md$/, 'project documentation'],
  [/\/test\/|^tests\//, 'tests'],
  [/^scripts\/|^infra\/|^\.github\//, 'project tooling'],
];

function describeCommit(subject: string, files: string[]) {
  const title = subject.trim();
  if (title && !/^(?:(?:chore|fix|feat)\s*:\s*)?(?:save[ds]?|wip|updat(?:e|es|ed)|fix(?:es)?|changes?|tweaks?|stuff)(?:\s+(?:for now|stuff|and stuff))?[.!\s]*$/i.test(title)) return title;

  const changed = areas.filter(([pattern]) => files.some(file => pattern.test(file))).map(([, label]) => label);
  const summary = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(changed);
  return summary ? `Updated ${summary}.` : 'Updated the project.';
}

export async function readCommitNotes(cwd: string, since: string): Promise<PatchNoteDay[]> {
  const { stdout } = await git('git', [
    'log', '--no-merges', '--no-renames', '--topo-order', '--format=%x00%as%x00%s', '--name-only', '-z', `${since}..HEAD`, '--',
  ], { cwd, timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
  const days = new Map<string, string[]>();
  // Git separates fields and paths with NULs. Each commit starts with an extra NUL.
  for (const record of stdout.slice(1).split('\0\0')) {
    const [date, subject, ...files] = record.split('\0');
    if (!date || subject === undefined) continue;
    const changes = days.get(date) ?? [];
    changes.push(describeCommit(subject, files.map(file => file.replace(/^\n/, ''))));
    days.set(date, changes);
  }
  return [...days].sort(([left], [right]) => right.localeCompare(left)).map(([date, changes]) => ({ date, changes }));
}

export function patchNotes(): Plugin {
  return {
    name: 'party-patch-notes',
    async generateBundle() {
      let notes: PatchNoteDay[];
      try {
        notes = await readCommitNotes(repository, baseline);
      } catch {
        this.warn('Could not read the Git history for patch notes. This build includes the curated history only.');
        notes = [];
      }
      this.emitFile({ type: 'asset', fileName: COMMIT_NOTES_PATH, source: JSON.stringify(notes) });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' || request.url?.split('?')[0] !== `${server.config.base}${COMMIT_NOTES_PATH}`) return next();
        response.setHeader('Cache-Control', 'no-store');
        try {
          const notes = await readCommitNotes(repository, baseline);
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(notes));
        } catch {
          response.statusCode = 503;
          response.end();
        }
      });
    },
  };
}
