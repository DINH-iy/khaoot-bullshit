import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('Bar games: teams drive the bus by voting on each guess, then everyone picks left or right in secret', async ({ browser, baseURL }) => {
  test.skip(test.info().project.name === 'android-chrome', 'Two phones are emulated in separate contexts below.');
  test.setTimeout(150_000);
  const open = async (size: { width: number; height: number }) => (await browser.newContext({ viewport: size, reducedMotion: 'reduce' })).newPage();
  const host = await open({ width: 1280, height: 900 });
  await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
  await host.getByRole('radio', { name: /Bar games/ }).check();
  await host.getByRole('button', { name: 'Open room', exact: true }).click();
  const code = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
  await closeRoundsByHand(host);
  const phones: Page[] = [];
  for (const name of ['Ada', 'Bo']) {
    const phone = await open({ width: 390, height: 844 }); await phone.goto(`${baseURL}/?code=${code}`);
    await phone.getByLabel('Your name').fill(name); await phone.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(phone.getByRole('button', { name: 'Change my look' })).toBeVisible(); phones.push(phone);
  }
  const [ada, bo] = phones as [Page, Page];

  // The intro, then two random teams (one player each, so each is also its team's captain).
  await host.getByRole('button', { name: 'Start the game' }).click();
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await host.getByRole('button', { name: 'Start round with these teams' }).click();
  await host.getByRole('button', { name: 'Next', exact: true }).click();

  // Drive the bus explains itself first: the phones say they are ready, then the host starts the round.
  for (const phone of phones) {
    await expect(phone.getByRole('region', { name: 'How it works' })).toContainText(/red or black/);
    await phone.getByRole('button', { name: 'Got it!' }).click();
    await expect(phone.getByText('Waiting for the host to start…')).toBeVisible();
  }
  await expect(host.getByRole('region', { name: 'How it works' })).toContainText('2 of 2 ready');
  await host.getByRole('button', { name: 'Start the round' }).click();

  // Drive the bus: each team votes on its guess; a vote of everyone in the team decides at once.
  for (const phone of phones) await expect(phone.getByText(/Round 1 of 4 · Red or black\?/)).toBeVisible({ timeout: 15_000 });
  await expect(ada.getByText(/Vote for your team’s choice/)).toBeVisible();
  expect((await new AxeBuilder({ page: ada }).analyze()).violations).toEqual([]);
  const guesses = [['Red', 'Black'], ['Higher', 'Lower'], ['Inside', 'Outside'], [/Hearts/, /Spades/]] as const;
  for (const [round, [forAda, forBo]] of guesses.entries()) {
    await ada.getByRole('button', { name: forAda }).click(); await bo.getByRole('button', { name: forBo }).click();
    // Each guessed card is turned on the phone (and only then).
    await expect(ada.locator('.bus-cards.big .bus-card:not(.down)')).toHaveCount(round + 1);
  }
  for (const phone of phones) await expect(phone.getByRole('status').filter({ hasText: /\d+ sips? in total|\d+ sips?$/ }).first()).toBeVisible();
  // The shared screen (here: the host) shows every team's cards.
  await expect(host.locator('.step-sides li')).toHaveCount(2);
  await expect(host.locator('.step-sides li.done')).toHaveCount(2);
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Reveal results' }).click();
  await expect(host.getByRole('region', { name: 'Round results' })).toContainText(/sips?/);
  const phoneResults = ada.getByRole('region', { name: 'Round results' });
  await expect(phoneResults.getByRole('heading', { name: 'Results', exact: true })).toHaveCount(0);
  await expect(phoneResults.locator('.bus-card')).toHaveCount(4);
  await expect(phoneResults).toContainText('Team sips');
  await expect(phoneResults.locator('.mg-podium')).toHaveCount(0);
  await expect(host.getByRole('region', { name: 'Round results' }).locator('.bus-card')).toHaveCount(8);

  // Left or right: alone, in secret. Ada and Bo pick differently: a tie, nobody wins.
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  for (const phone of phones) await expect(phone.getByText(/Left or right\? No talking/)).toBeVisible({ timeout: 15_000 });
  await ada.getByRole('button', { name: /Left/ }).click(); await bo.getByRole('button', { name: /Right/ }).click();
  await expect(ada.getByRole('status').filter({ hasText: 'Your choice is in.' })).toBeVisible();
  // Before the reveal nobody sees what the others chose.
  await expect(host.locator('.step-sides')).not.toContainText(/Left|Right/);
  await expect(host.locator('.step-sides .step-chosen.yes')).toHaveCount(2);
  await host.getByRole('button', { name: 'Close answers' }).click();
  await host.getByRole('button', { name: 'Reveal results' }).click();
  await expect(host.getByRole('region', { name: 'Round results' })).toContainText(/Left/);
  await expect(phoneResults).toContainText('Tie');
});
