import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { readCommitNotes } from '../../tooling/patch-notes.js';

test('reads only new commits, keeps same-day entries and describes generic titles', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'party-commit-notes-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'Notes Test');
    git('config', 'user.email', 'notes-test@example.invalid');
    git('commit', '--allow-empty', '-qm', 'Already listed', '--date=2026-11-25T12:00:00+01:00');
    const baseline = git('rev-parse', 'HEAD');
    expect(await readCommitNotes(repo, baseline)).toEqual([]);

    const file = join(repo, 'apps/web/src/arcade/lobby.ts');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, '// New lobby');
    git('add', '.');
    git('commit', '-qm', 'Save!', '--date=2026-11-26T12:00:00+01:00');
    git('commit', '--allow-empty', '-qm', 'Add an invitation button', '-m', 'Private details', '--date=2026-11-26T13:00:00+01:00');
    git('commit', '--allow-empty', '-qm', 'Update', '--date=2026-11-27T12:00:00+01:00');

    expect(await readCommitNotes(repo, baseline)).toEqual([
      { date: '2026-11-27', changes: ['Updated the project.'] },
      { date: '2026-11-26', changes: ['Add an invitation button', 'Updated Arcade.'] },
    ]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
