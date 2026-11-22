import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGES } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The demo page of the digital twin in Chromium, on the product (S18): an administrator of the
 * synthetic airport chooses a scenario of the library and plays its day to a twin checkpoint;
 * every call is in the offline simulator's order; the twin's display shows its numbers, its lane
 * station and console only show it; the speed changes while it plays, and it stops. Other staff
 * may not open the page.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const SHOTS = process.env.GATEFLOW_SHOTS;
const en = MESSAGES.en;

let product: Product;
let browser: Browser;
const elsewhere: string[] = [];

beforeAll(async () => {
  product = await startProduct(inject('databaseUrl'), 'vce-like-normal-day.yaml', { twin: true });
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
});

afterAll(async () => {
  await browser.close();
  await product.stop();
});

async function context(width = 1366, height = 900): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: 'en-GB',
    deviceScaleFactor: SHOTS === undefined ? 1 : 2,
  });
  ctx.on('request', (request) => {
    if (!request.url().startsWith(`${product.base}/`)) elsewhere.push(request.url());
  });
  return ctx;
}

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  try {
    await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  } catch (error) {
    process.stdout.write(`screenshot ${name} not saved: ${(error as Error).message}\n`);
  }
}

async function signIn(page: Page, who: 'operator' | 'supervisor' | 'admin'): Promise<void> {
  const { login, password } = product.staff[who];
  await page.waitForSelector('#demo-sign-in');
  await page.fill('#demo-login', login);
  await page.fill('#demo-password', password);
  await page.click('#demo-sign-in-submit');
}

describe('the demo page of the digital twin (S18)', () => {
  it('is for administrators only', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(`${product.base}/demo?lang=en`);
    await signIn(page, 'supervisor');
    await page.waitForSelector('#demo-not-allowed');
    expect(await page.textContent('#demo-not-allowed')).toBe(en['demo.notAllowed']);
    await ctx.close();
  });

  it("plays a day of the library in the simulator's order, on the product's own screens", async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(`${product.base}/demo?lang=en`);
    await signIn(page, 'admin');
    await page.waitForSelector('.demo[data-phase="ready"] #demo-scenario option', {
      state: 'attached',
    });
    expect(await page.textContent('#demo-simulated')).toBe(en['demo.simulated']);
    // The scenarios of the airport only: the VCE-like days.
    const scenarios = await page
      .locator('#demo-scenario option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(scenarios.sort()).toEqual([
      'vce-like-disrupted-day',
      'vce-like-normal-day',
      'vce-like-peak-day',
    ]);
    // The peak day: at 05:00 the passengers called last are still on their way to the lanes.
    await page.selectOption('#demo-scenario', 'vce-like-peak-day');
    expect(await page.locator('#demo-policy option:checked').getAttribute('data-policy')).toBe(
      'priority-v3',
    );
    // The early morning of the day, as fast as the server goes.
    await page.fill('#demo-until', '05:00');
    await page.selectOption('#demo-speed', 'max');
    await page.click('#demo-start');
    await page.waitForSelector('#demo-state[data-state="FINISHED"]', { timeout: 240_000 });
    const check = (await page.textContent('#demo-check')) ?? '';
    const calls = Number(/(\d+) calls/.exec(check)?.[1]);
    expect(check).toBe(en['demo.same'].replace('{calls}', String(calls)));
    expect(calls).toBeGreaterThan(50);
    expect(Number(await page.textContent('#demo-counts [data-count="issued"] dd'))).toBeGreaterThan(
      50,
    );
    // The board and the latest calls, with the engine's reasons.
    await page.waitForSelector('#demo-called li');
    await page.waitForSelector('#demo-calls li code');
    const latest = await page.getAttribute('#demo-called li', 'data-number');
    expect(latest).toMatch(/^T\d{3,}$/);
    await shot(page, 'demo-finished');

    // The twin's own display, lane station and console.
    await page.click('#demo-display-make');
    const href = await page.getAttribute('#demo-display-open', 'href');
    expect(href).toMatch(/^\/display\/[0-9a-f-]{36}#device=/);
    const display = await ctx.newPage();
    const displayErrors = watch(display);
    await display.goto(`${product.base}${href ?? ''}`);
    await display.waitForSelector(`#display-called [data-ticket="${latest ?? ''}"]`);
    await shot(display, 'demo-display');
    const lane = await ctx.newPage();
    await lane.goto(`${product.base}${(await page.getAttribute('#demo-lane', 'href')) ?? ''}`);
    await lane.waitForSelector('#lane-twin');
    expect(await lane.textContent('#lane-twin')).toBe(en['twin.banner']);
    expect(await lane.locator('#lane-call').isDisabled()).toBe(true);
    const consolePage = await ctx.newPage();
    await consolePage.goto(
      `${product.base}${(await page.getAttribute('#demo-console', 'href')) ?? ''}`,
    );
    await consolePage.waitForSelector('#console-twin');
    expect(await consolePage.locator('#console-set-PAUSED').isDisabled()).toBe(true);
    await consolePage.waitForSelector('#console-audit-list li');
    await shot(consolePage, 'demo-console');

    // Again, slower: the virtual clock moves, the speed changes while it plays, then it stops.
    await page.fill('#demo-until', '');
    await page.selectOption('#demo-speed', '300');
    await page.click('#demo-start');
    await page.waitForSelector('#demo-state[data-state="RUNNING"]');
    const first = await page.textContent('#demo-clock');
    await page.waitForFunction(
      (before) => document.querySelector('#demo-clock')?.textContent !== before,
      first,
      { timeout: 20_000 },
    );
    await page.selectOption('#demo-speed', '1000');
    await page.waitForSelector('#demo-progress:has-text("1000×")');
    await page.click('#demo-stop');
    await page.waitForSelector('#demo-state[data-state="STOPPED"]');
    // Wide or narrow, nothing scrolls sideways.
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        String(width),
      ).toBe(true);
    }
    await shot(page, 'demo-stopped');
    expect(errors).toEqual([]);
    expect(displayErrors).toEqual([]);
    await ctx.close();
  });

  it('loads nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
