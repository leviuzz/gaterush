import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticBoardingPass } from '@gateflow/bcbp';
import type { DemoFlightsResponse, ScanResponse, SetModeResponse } from '@gateflow/contracts';
import { MESSAGES } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { browserRandom } from '../src/random';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The modes of a checkpoint in Chromium, on the product (S17): the supervisor pauses the calls,
 * then declares an emergency, then resumes. The display, the kiosk, the lane station and the
 * passenger's page each say so at once, in their language: paused, the kiosk goes on giving
 * numbers and the station cannot call; in an emergency, the display and the kiosk show only the
 * emergency message, the kiosk reads nothing and the station issues nothing.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const SHOTS = process.env.GATEFLOW_SHOTS;

let product: Product;
let browser: Browser;
const elsewhere: string[] = [];

beforeAll(async () => {
  product = await startProduct(inject('databaseUrl'), 'vce-like-normal-day.yaml');
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
});

afterAll(async () => {
  await browser.close();
  await product.stop();
});

interface Opened {
  readonly page: Page;
  readonly errors: string[];
}

async function open(
  path: string,
  size: { width: number; height: number },
  locale = 'en-GB',
): Promise<Opened> {
  const context = await browser.newContext({
    viewport: size,
    locale,
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
  await page.goto(`${product.base}${path}`);
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

let keys = 0;
/** The supervisor sets the mode, through the API (the console comes with S17.3). */
async function setMode(mode: string, reset = false): Promise<SetModeResponse> {
  const response = await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/mode`, {
    method: 'POST',
    headers: {
      cookie: product.staffCookie,
      'content-type': 'application/json',
      'idempotency-key': `modes-e2e-${String(++keys)}`,
    },
    body: JSON.stringify({ mode, reset }),
  });
  if (!response.ok) throw new Error(`mode ${mode}: ${String(response.status)}`);
  return (await response.json()) as SetModeResponse;
}

/** A passenger takes a number at the kiosk (through the API, as the kiosk would). */
async function passenger(): Promise<{ number: string; ref: string }> {
  const demo = (await (
    await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/demo-flights`, {
      headers: { authorization: `Bearer ${product.kioskToken}` },
    })
  ).json()) as DemoFlightsResponse;
  const flight = demo.flights.find((f) => Date.parse(f.departure) > Date.now() + 60 * 60_000);
  if (flight === undefined) throw new Error('no demo flight in the next 24 hours');
  const [year = 0, month = 0, day = 0] = flight.date.split('-').map(Number);
  const { text } = syntheticBoardingPass(browserRandom(), [
    {
      from: 'VCE',
      to: 'FCO',
      carrier: flight.carrier,
      flightNumber: flight.flightNumber,
      date: { year, month, day },
    },
  ]);
  const scanned = (await (
    await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/scans`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${product.kioskToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bcbp: text }),
    })
  ).json()) as ScanResponse;
  if (scanned.ticket === null || scanned.ref === null) throw new Error('no ticket');
  return { number: scanned.ticket.number, ref: scanned.ref };
}

async function signIn(page: Page): Promise<void> {
  const { login, password } = product.staff.operator;
  await page.waitForSelector('#lane-sign-in');
  await page.fill('#lane-login', login);
  await page.fill('#lane-password', password);
  await page.click('#lane-sign-in-submit');
  await page.waitForSelector('.lane[data-phase="ready"]');
}

/** Whether a display fits its screen, without scrolling either way. */
async function fits(page: Page): Promise<{ wide: boolean; tall: boolean }> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.display');
    if (root === null) return { wide: false, tall: false };
    root.style.minHeight = '0';
    const tall = root.getBoundingClientRect().height <= window.innerHeight;
    root.style.minHeight = '';
    return { wide: document.documentElement.scrollWidth <= window.innerWidth, tall };
  });
}

const it_ = MESSAGES.it;
const en = MESSAGES.en;

describe('the modes of a checkpoint (S17)', () => {
  it('pauses the calls, stops everything in an emergency, and resumes', async () => {
    for (let i = 0; i < 6; i++) await passenger();
    const mine = await passenger();
    const display = await open(
      `/display/${product.checkpointId}?lang=it#device=${product.displayToken}`,
      { width: 1920, height: 1080 },
      'it-IT',
    );
    await display.page.waitForSelector('.display[data-state="live"] #display-called-title');
    const kiosk = await open(
      `/kiosk/${product.checkpointId}?lang=en#device=${product.kioskToken}`,
      {
        width: 1080,
        height: 1920,
      },
    );
    await kiosk.page.waitForSelector('#kiosk-welcome');
    const lane = await open(`/lane/${product.checkpointId}?lang=en`, { width: 1280, height: 900 });
    await signIn(lane.page);
    await lane.page.click('#lane-call');
    await lane.page.waitForSelector('#lane-called li');
    const phone = await open(`/t/${mine.ref}?lang=en`, { width: 390, height: 844 });
    await phone.page.waitForSelector('#ticket-state');
    expect(await phone.page.locator('#ticket-mode').count()).toBe(0);

    // Paused: the display says so above the numbers, the station cannot call.
    expect(await setMode('PAUSED')).toMatchObject({ outcome: 'DONE', mode: 'PAUSED' });
    await display.page.waitForSelector('#display-paused');
    expect(await display.page.textContent('#display-paused')).toBe(
      `${it_['display.paused']}${en['display.paused']}`,
    );
    expect(await display.page.locator('#display-called li').count()).toBeGreaterThan(0);
    await lane.page.waitForSelector('#lane-mode[data-mode="PAUSED"]');
    expect(await lane.page.textContent('#lane-mode')).toBe(en['lane.mode.PAUSED']);
    expect(await lane.page.isDisabled('#lane-call')).toBe(true);
    await phone.page.reload();
    await phone.page.waitForSelector('#ticket-mode[data-mode="PAUSED"]');
    expect(await phone.page.textContent('#ticket-mode')).toBe(en['ticket.paused']);
    // The kiosk goes on giving numbers, and says the calls are paused.
    await kiosk.page.waitForSelector('#kiosk-sample');
    await kiosk.page.click('#kiosk-sample');
    await kiosk.page.waitForSelector('#kiosk-ticket #kiosk-paused');
    expect(await kiosk.page.textContent('#kiosk-paused')).toBe(en['kiosk.paused']);
    await shot(display.page, 'modes-display-paused');
    await shot(lane.page, 'modes-lane-paused');
    await shot(phone.page, 'modes-phone-paused');
    await kiosk.page.click('#kiosk-done');
    // Paused, the display still fits its screens.
    for (const size of [
      { width: 1280, height: 720 },
      { width: 1080, height: 1920 },
    ]) {
      const other = await open(
        `/display/${product.checkpointId}?lang=it#device=${product.displayToken}`,
        size,
        'it-IT',
      );
      await other.page.waitForSelector('#display-paused');
      expect(await fits(other.page), `${String(size.width)}x${String(size.height)}`).toEqual({
        wide: true,
        tall: true,
      });
      expect(other.errors).toEqual([]);
      await other.page.context().close();
    }

    // The emergency: the message alone, on the display and on the kiosk.
    expect(await setMode('EMERGENCY')).toMatchObject({ outcome: 'DONE', mode: 'EMERGENCY' });
    await display.page.waitForSelector('#display-emergency');
    expect(await display.page.textContent('#display-emergency')).toBe(
      `${it_['display.emergency']}${en['display.emergency']}`,
    );
    expect(await display.page.locator('#display-called').count()).toBe(0);
    await kiosk.page.waitForSelector('#kiosk-emergency');
    expect(await kiosk.page.textContent('#kiosk-emergency h1')).toBe(en['kiosk.emergency.title']);
    expect(await kiosk.page.locator('#kiosk-code').count()).toBe(0);
    // In Italian, the English text comes below.
    await kiosk.page.click('button[lang="it"]');
    await kiosk.page.waitForSelector('#kiosk-emergency .in-english');
    expect(await kiosk.page.textContent('#kiosk-emergency h1')).toBe(it_['kiosk.emergency.title']);
    await lane.page.waitForSelector('#lane-mode[data-mode="EMERGENCY"]');
    expect(await lane.page.isDisabled('#lane-call')).toBe(true);
    expect(await lane.page.isDisabled('#manual-issue')).toBe(true);
    await phone.page.reload();
    await phone.page.waitForSelector('#ticket-mode[data-mode="EMERGENCY"]');
    expect(await phone.page.textContent('#ticket-mode')).toBe(en['ticket.emergency']);
    await shot(display.page, 'modes-display-emergency');
    await shot(kiosk.page, 'modes-kiosk-emergency');
    await shot(lane.page, 'modes-lane-emergency');
    await shot(phone.page, 'modes-phone-emergency');

    // The end of the emergency, with the window announced again in order of arrival.
    expect(await setMode('NORMAL', true)).toMatchObject({ outcome: 'DONE', reset: true });
    await kiosk.page.waitForSelector('#kiosk-welcome');
    await display.page.waitForSelector('.display[data-mode="NORMAL"] #display-called-title');
    expect(await display.page.locator('#display-paused').count()).toBe(0);
    await lane.page.waitForFunction(() => document.querySelector('#lane-mode') === null);
    expect(await lane.page.isDisabled('#lane-call')).toBe(false);
    for (const opened of [display, kiosk, lane, phone]) {
      expect(opened.errors).toEqual([]);
      await opened.page.context().close();
    }
  });

  it('loads nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
