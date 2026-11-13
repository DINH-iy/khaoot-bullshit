import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { closeRoundsByHand } from './helpers.js';

const ownerToken = process.env['LOCAL_OWNER_TOKEN'];
if (!ownerToken || process.env['NODE_ENV'] !== 'test') throw new Error('Dedicated E2E owner key required');

test('a player whose phone dies continues on a new phone, after the host approves', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext(); const host = await hostContext.newPage();
  const oldContext = await browser.newContext(); const oldPhone = await oldContext.newPage();
  const newContext = await browser.newContext(); const newPhone = await newContext.newPage();
  try {
    await host.goto(`${baseURL}/?host=1#owner=${ownerToken}`);
    await host.getByRole('radio', { name: /First reliable game/ }).check();
    await host.getByRole('button', { name: 'Open room', exact: true }).click();
    const roomCode = (await host.getByRole('heading', { name: /^Room [A-Z2-9]{6}$/ }).textContent())!.slice(5);
    await closeRoundsByHand(host);
    const ask = host.getByRole('checkbox', { name: 'Ask me before a new phone takes over a seat' });
    await expect(ask).not.toBeChecked();
    // The box reflects the saved room setting, so it ticks once the server has stored it.
    await ask.click();
    await expect(ask).toBeChecked();

    await oldPhone.goto(`${baseURL}/?code=${roomCode}`);
    await oldPhone.getByLabel('Your name').fill('Sam');
    await oldPhone.getByRole('button', { name: 'Join room', exact: true }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await oldPhone.getByRole('radio', { name: 'Canberra', exact: true }).check();
    await oldPhone.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(oldPhone.getByText('Your answer is in!')).toBeVisible();

    // While the old phone is connected, its seat is not offered.
    await newPhone.goto(`${baseURL}/?code=${roomCode}`);
    await newPhone.getByRole('button', { name: 'Take over my seat' }).click();
    await expect(newPhone.getByText('No seat is free right now.')).toBeVisible();
    // The battery dies.
    await oldContext.close();
    await expect(host.getByText('Sam · disconnected', { exact: false })).toBeVisible();
    await newPhone.getByRole('button', { name: 'Refresh seats' }).click();
    await newPhone.getByRole('button', { name: 'I am Sam' }).click();
    await expect(newPhone.getByText('Waiting for the host to approve taking over Sam’s seat…')).toBeVisible();
    expect((await new AxeBuilder({ page: newPhone }).analyze()).violations).toEqual([]);

    const requests = host.getByRole('region', { name: 'Seat requests' });
    await expect(requests).toContainText('A new phone wants Sam’s seat');
    expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
    await requests.getByRole('button', { name: 'Approve for Sam' }).click();
    await expect(requests).toHaveCount(0);

    await expect(newPhone.getByRole('heading', { name: `Room ${roomCode}` })).toBeVisible();
    // The player list is behind the phone's bottom bar now.
    await newPhone.getByRole('navigation', { name: 'More' }).getByRole('button', { name: /^Players/ }).click();
    await expect(newPhone.getByRole('dialog', { name: /^Players/ })).toContainText('Sam (you)');
    await newPhone.keyboard.press('Escape');
    await expect(newPhone.getByText('Your answer is in!')).toBeVisible();
    await expect(host.getByText('Sam · connected', { exact: false })).toBeVisible();
    await newPhone.reload();
    await expect(newPhone.getByText('Your answer is in!')).toBeVisible();
    expect(await newPhone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { for (const context of [hostContext, newContext, oldContext]) await context.close().catch(() => undefined); }
});
