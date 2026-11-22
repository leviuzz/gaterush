import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticBoardingPass } from '@gateflow/bcbp';
import type { DemoFlightsResponse, ScanResponse } from '@gateflow/contracts';
import { MESSAGES, t } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { browserRandom } from '../src/random';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The lane station in Chromium, on the product itself (S15): staff sign in with the session in a
 * cookie the page cannot read, call the next passenger, validate tickets by number, QR code or
 * boarding pass, act on absences and reviews as their role allows, and issue manual tickets.
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

async function open(width = 1280, height = 900): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'en-GB',
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
  await page.goto(`${product.base}/lane/${product.checkpointId}?lang=en`);
  return { page, errors };
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  try {
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  } catch (error) {
    process.stdout.write(`screenshot ${name} not saved: ${(error as Error).message}\n`);
  }
}

async function signIn(page: Page, who: 'operator' | 'supervisor'): Promise<void> {
  const { login, password } = product.staff[who];
  await page.waitForSelector('#lane-sign-in');
  await page.fill('#lane-login', login);
  await page.fill('#lane-password', password);
  await page.click('#lane-sign-in-submit');
  await page.waitForSelector('.lane[data-phase="ready"]');
}

/** A passenger takes a number at the kiosk (through the API, as the kiosk would). */
async function passenger(pnr: string): Promise<{ number: string; ref: string; pass: string }> {
  const demo = (await (
    await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/demo-flights`, {
      headers: { authorization: `Bearer ${product.kioskToken}` },
    })
  ).json()) as DemoFlightsResponse;
  const flight = demo.flights.find((f) => Date.parse(f.departure) > Date.now() + 60 * 60_000);
  if (flight === undefined) throw new Error('no demo flight in the next 24 hours');
  const [year = 0, month = 0, day = 0] = flight.date.split('-').map(Number);
  const random = browserRandom();
  const { text } = syntheticBoardingPass(random, [
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
  if (scanned.ticket === null || scanned.ref === null) throw new Error(`no ticket for ${pnr}`);
  return { number: scanned.ticket.number, ref: scanned.ref, pass: text };
}

/** Calls next until `number` is called (the engine chooses the order). */
async function callUntil(page: Page, number: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await page.click('#lane-call');
    await page.waitForFunction(
      () => (document.querySelector('#lane-last')?.textContent ?? '') !== '',
    );
    if ((await page.locator(`#lane-called [data-ticket="${number}"]`).count()) > 0) return;
  }
  throw new Error(`${number} was never called`);
}

const outcome = (page: Page) => page.textContent('#lane-outcome');

async function validate(page: Page, code: string): Promise<void> {
  await page.fill('#lane-code', '');
  await page.focus('#lane-code');
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => (document.querySelector('#lane-outcome')?.textContent ?? '') !== '',
  );
}

describe('the lane station (S15)', () => {
  it('signs staff in with a session the page cannot read, and out', async () => {
    const { page } = await open();
    await page.waitForSelector('#lane-sign-in');
    await page.fill('#lane-login', product.staff.operator.login);
    await page.fill('#lane-password', 'not-the-password');
    await page.click('#lane-sign-in-submit');
    await page.waitForSelector('#lane-sign-in-error');
    expect(await page.textContent('#lane-sign-in-error')).toBe(MESSAGES.en['lane.signIn.failed']);
    await signIn(page, 'operator');
    expect(await page.textContent('#lane-member')).toBe(
      `${product.staff.operator.login} · ${MESSAGES.en['lane.role.OPERATOR']}`,
    );
    // The session is HttpOnly: no script of the page can read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain('gateflow_session');
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'gateflow_session')).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
    });
    // Signed in still after a reload; signed out on request.
    await page.reload();
    await page.waitForSelector('.lane[data-phase="ready"]');
    await page.click('#lane-sign-out');
    await page.waitForSelector('#lane-sign-in');
    await page.reload();
    await page.waitForSelector('#lane-sign-in');
    await shot(page, 'lane-sign-in');
    await page.context().close();
  });

  it('calls, marks an absence, brings it back and admits by number, QR code or boarding pass', async () => {
    const { page, errors } = await open();
    await signIn(page, 'operator');
    const first = await passenger('LANE01');
    const second = await passenger('LANE02');
    const third = await passenger('LANE03');
    await callUntil(page, first.number);
    // Absent, then back in the queue.
    const row = page.locator(`#lane-called [data-ticket="${first.number}"]`);
    await row.getByText(MESSAGES.en['lane.action.noShow']).click();
    await page.waitForSelector(`#lane-absent [data-ticket="${first.number}"]`);
    await page
      .locator(`#lane-absent [data-ticket="${first.number}"]`)
      .getByText(MESSAGES.en['lane.action.reactivate'])
      .click();
    await page.waitForSelector(`#lane-absent [data-ticket="${first.number}"]`, {
      state: 'detached',
    });
    // Not called yet: not admitted.
    await validate(page, first.number);
    expect(await outcome(page)).toBe(t('en', 'lane.outcome.NOT_CALLED', { number: first.number }));
    await callUntil(page, first.number);
    await validate(page, first.number.toLowerCase());
    expect(await outcome(page)).toBe(t('en', 'lane.outcome.ADMITTED', { number: first.number }));
    expect(await page.getAttribute('#lane-outcome', 'data-kind')).toBe('ok');
    await shot(page, 'lane-admitted');
    await validate(page, first.number);
    expect(await outcome(page)).toBe(
      t('en', 'lane.outcome.ALREADY_ADMITTED', { number: first.number }),
    );
    // The QR code of a ticket gives the address of its page; a pass, the pass itself.
    await callUntil(page, second.number);
    await validate(page, `${product.base}/t/${second.ref}`);
    expect(await outcome(page)).toBe(t('en', 'lane.outcome.ADMITTED', { number: second.number }));
    await callUntil(page, third.number);
    await validate(page, third.pass);
    expect(await outcome(page)).toBe(t('en', 'lane.outcome.ADMITTED', { number: third.number }));
    await validate(page, 'Z999');
    expect(await outcome(page)).toBe(MESSAGES.en['lane.outcome.UNKNOWN']);
    // A 404 for an unknown number is the only error the page sees.
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
    await page.context().close();
  });

  it('lets an operator ask for a review and a supervisor end it', async () => {
    const waiting = await passenger('LANE04');
    const operator = await open();
    await signIn(operator.page, 'operator');
    const row = operator.page.locator(`[data-ticket="${waiting.number}"]`).first();
    await row.waitFor();
    // An operator cannot cancel; they can ask for a review.
    expect(await row.getByText(MESSAGES.en['lane.action.cancel']).count()).toBe(0);
    await row.getByText(MESSAGES.en['lane.action.review']).click();
    const held = operator.page.locator(`#lane-review [data-ticket="${waiting.number}"]`);
    await held.waitFor();
    expect(await held.getByText(MESSAGES.en['lane.action.release']).count()).toBe(0);
    await operator.page.context().close();
    const supervisor = await open();
    await signIn(supervisor.page, 'supervisor');
    const review = supervisor.page.locator(`#lane-review [data-ticket="${waiting.number}"]`);
    await review.waitFor();
    await shot(supervisor.page, 'lane-supervisor');
    await review.getByText(MESSAGES.en['lane.action.release']).click();
    await review.waitFor({ state: 'detached' });
    await supervisor.page.context().close();
  });

  it('issues a manual ticket for a family, with its reason', async () => {
    const { page, errors } = await open(390, 844);
    await signIn(page, 'operator');
    await page.fill('#manual-party', '3');
    await page.selectOption('#manual-reason', 'GROUP');
    await page.click('#manual-issue');
    await page.waitForSelector('#manual-issued');
    const number = (await page.textContent('#manual-issued .number'))?.trim() ?? '';
    expect(number).toMatch(/^A\d{3}$/);
    await page.waitForSelector(`[data-ticket="${number}"]`);
    expect(await page.textContent(`[data-ticket="${number}"] .row-detail`)).toContain(
      t('en', 'lane.people', { count: 3 }),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await shot(page, 'lane-phone');
    // In Spanish too.
    await page.click('button[lang="es"]');
    expect(await page.textContent('#lane-call')).toBe(MESSAGES.es['lane.callNext']);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('shows at once what another station or a kiosk does (S16)', async () => {
    const first = await open();
    await signIn(first.page, 'operator');
    const second = await open();
    await signIn(second.page, 'operator');
    // A kiosk issues a number: both stations show it without waiting for a poll (20 seconds).
    const waiting = await passenger('LANE05');
    for (const { page } of [first, second]) {
      await page.waitForSelector(`[data-ticket="${waiting.number}"]`, { timeout: 5000 });
    }
    // The first station calls it: the second shows it called.
    await callUntil(first.page, waiting.number);
    await second.page.waitForSelector(`#lane-called [data-ticket="${waiting.number}"]`, {
      timeout: 5000,
    });
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    await first.page.context().close();
    await second.page.context().close();
  });

  it('loads nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
