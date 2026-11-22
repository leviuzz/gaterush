import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CallNextResponse, FlightsResponse, IssueTicketResponse } from '@gateflow/contracts';
import { MESSAGES } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The display in Chromium, on the product (S16): it follows the checkpoint's stream, shows each
 * call at once (a second call marked), says when its data is not up to date and, after two
 * minutes without news, asks passengers to follow the staff; when the network comes back it
 * catches up with every call it missed. It fits landscape and portrait screens.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const SHOTS = process.env.GATEFLOW_SHOTS;

let product: Product;
let browser: Browser;
let flightId: string;
const elsewhere: string[] = [];

beforeAll(async () => {
  product = await startProduct(inject('databaseUrl'), 'vce-like-normal-day.yaml');
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
  const flights = (await (
    await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/flights`, {
      headers: { cookie: product.staffCookie },
    })
  ).json()) as FlightsResponse;
  const later = flights.flights.find((f) => Date.parse(f.departure) > Date.now() + 90 * 60_000);
  if (later === undefined) throw new Error('no flight');
  flightId = later.id;
});

afterAll(async () => {
  await browser.close();
  await product.stop();
});

let keys = 0;
async function staff<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/${path}`, {
    method: 'POST',
    headers: {
      cookie: product.staffCookie,
      'idempotency-key': `display-e2e-${String(++keys)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${path}: ${String(response.status)}`);
  return (await response.json()) as T;
}

const issue = () =>
  staff<IssueTicketResponse>('tickets', { flightId, segment: 'DEPARTING', reason: 'OTHER' });

async function callNext(): Promise<string> {
  const { called } = await staff<CallNextResponse>('calls');
  if (called === null) throw new Error('nobody to call');
  return called.number;
}

async function open(
  options: { width?: number; height?: number; token?: string; clock?: boolean } = {},
): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1920, height: options.height ?? 1080 },
    locale: 'it-IT',
    deviceScaleFactor: SHOTS === undefined ? 1 : 2,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(`${product.base}/`)) elsewhere.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  if (options.clock === true) await page.clock.install();
  const token = options.token ?? product.displayToken;
  await page.goto(`${product.base}/display/${product.checkpointId}?lang=it#device=${token}`);
  return { page, errors };
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  try {
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  } catch (error) {
    process.stdout.write(`screenshot ${name} not saved: ${(error as Error).message}\n`);
  }
}

const it_ = MESSAGES.it;
const en = MESSAGES.en;

describe('the display (S16)', () => {
  it('is not set up without the token of a display of this checkpoint', async () => {
    const { page } = await open({ token: product.kioskToken });
    await page.waitForSelector('#display-not-set-up');
    expect(await page.textContent('#display-not-set-up')).toBe(
      `${it_['display.notSetUp']}${en['display.notSetUp']}`,
    );
    await page.context().close();
  });

  it('shows each call at once, a second call marked, and the numbers to get ready', async () => {
    const { page, errors } = await open();
    await page.waitForSelector('.display[data-state="live"] #display-called-title');
    expect(await page.textContent('#display-called-title')).toBe(
      `${it_['display.called']}${en['display.called']}`,
    );
    const tickets = [await issue(), await issue(), await issue()];
    await page.waitForSelector(
      `#display-prepare [data-ticket="${tickets[0]?.ticket.number ?? ''}"]`,
    );
    const called = await callNext();
    await page.waitForSelector(`#display-called [data-ticket="${called}"].fresh`);
    expect(await page.locator(`#display-prepare [data-ticket="${called}"]`).count()).toBe(0);
    const id = tickets.find((t) => t.ticket.number === called)?.ticket.id ?? '';
    await staff(`tickets/${id}/recall`);
    const second = page.locator(`#display-called [data-ticket="${called}"][data-second="true"]`);
    await second.waitFor();
    expect(await second.textContent()).toContain(it_['display.secondCall']);
    expect(await second.textContent()).toContain(en['display.secondCall']);
    // No reference, no name: numbers only.
    expect(await page.content()).not.toContain(tickets[0]?.ref ?? '-');
    await shot(page, 'display-landscape');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('says when it is not up to date, falls back to the staff, and catches up', async () => {
    const { page, errors } = await open({ clock: true });
    await page.waitForSelector('.display[data-state="live"] #display-called-title');
    // From now on the display's time moves only when the test says.
    await page.clock.pauseAt(Date.now() + 1000);
    // The server fails: the stream breaks, and the display cannot reconnect.
    await product.stopServer();
    // 30 seconds without news: not up to date.
    await page.clock.fastForward(31_000);
    await page.waitForSelector('#display-stale');
    expect(await page.textContent('#display-stale')).toBe(
      `${it_['display.stale']}${en['display.stale']}`,
    );
    await shot(page, 'display-stale');
    // Two minutes: the staff's instructions instead of numbers.
    await page.clock.fastForward(90_000);
    await page.waitForSelector('#display-down');
    expect(await page.textContent('#display-down')).toBe(
      `${it_['display.down']}${en['display.down']}`,
    );
    expect(await page.locator('#display-called').count()).toBe(0);
    await shot(page, 'display-down');
    // The server is back, and calls two numbers before the display reconnects.
    await product.startServer();
    await issue();
    await issue();
    const missed = [await callNext(), await callNext()];
    // The display reconnects with the id of its last message: the calls it missed flash.
    await page.clock.fastForward(16_000);
    for (const number of missed) {
      await page.waitForSelector(`#display-called [data-ticket="${number}"].fresh`);
    }
    await page.waitForSelector('.display[data-state="live"]');
    expect(await page.locator('#display-stale').count()).toBe(0);
    // Only the failures of the network were reported.
    expect(errors.filter((e) => !e.includes('net::ERR_'))).toEqual([]);
    await page.context().close();
  });

  it('fits landscape and portrait screens, full of numbers', async () => {
    for (let i = 0; i < 12; i++) await issue();
    for (let i = 0; i < 6; i++) await callNext();
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
      { width: 1080, height: 1920 },
      { width: 768, height: 1024 },
    ]) {
      const name = `${String(size.width)}x${String(size.height)}`;
      const { page, errors } = await open(size);
      await page.waitForSelector('#display-called li');
      const fits = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.display');
        if (root === null) return { wide: false, tall: false };
        root.style.minHeight = '0';
        const tall = root.getBoundingClientRect().height <= window.innerHeight;
        root.style.minHeight = '';
        return { wide: document.documentElement.scrollWidth <= window.innerWidth, tall };
      });
      expect(fits, name).toEqual({ wide: true, tall: true });
      await shot(page, `display-${name}`);
      expect(errors).toEqual([]);
      await page.context().close();
    }
  });

  it('loads nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
