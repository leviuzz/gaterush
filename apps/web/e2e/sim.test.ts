import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The Simulator Studio served by GateFlow at /sim, in Chromium, on the product (S19): an analyst
 * simulates a run in the page, signs in and saves it; GateFlow simulates it again on threads of
 * its own and finds the page's results; the analyst opens it back in the page. The page connects
 * to this server only, and runs no script but its own.
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

async function open(): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: 'en-GB',
    deviceScaleFactor: SHOTS === undefined ? 1 : 2,
  });
  context.on('request', (request) => {
    if (!/^(blob|data):/.test(request.url()) && !request.url().startsWith(`${product.base}/`)) {
      elsewhere.push(request.url());
    }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  // A quiet start: the page simulates nothing by itself.
  await page.goto(`${product.base}/sim#manual`);
  await page.waitForSelector('#gateflow');
  return { page, errors };
}

async function signIn(page: Page, who: { login: string; password: string }): Promise<void> {
  await page.fill('#gateflow-login', who.login);
  await page.fill('#gateflow-password', who.password);
  await page.click('#gateflow-sign-in');
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

describe('the Simulator Studio served by GateFlow (S19)', () => {
  it('is served under a policy that allows its own script only, and connects to this server only', async () => {
    const r = await fetch(`${product.base}/sim`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const csp = r.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+' blob:/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-inline' blob:");
  });

  it('saves a run of the page; GateFlow simulates it again, finds the same results, and opens it', async () => {
    const { page, errors } = await open();
    await page.selectOption('#scenario', 'scenarios/single-checkpoint-demo.yaml');
    await page.fill('#days', '3');
    await page.click('#run');
    await page.waitForSelector('#run-status[data-state="done"]', { timeout: 240_000 });

    await signIn(page, product.staff.analyst);
    await page.waitForSelector('#gateflow-member');
    expect(await page.textContent('#gateflow-member')).toBe('e2e.analyst (analyst)');
    await page.click('#gateflow-save');
    await page.waitForSelector('#gateflow-notice');
    expect(await page.isDisabled('#gateflow-save')).toBe(true);
    // GateFlow simulates it again, on its own threads, and finds the page's results.
    const done = page.locator('#gateflow-runs li[data-state="DONE"]');
    await done.first().waitFor({ timeout: 120_000 });
    expect(await done.first().getAttribute('data-matches')).toBe('true');
    expect(await done.first().textContent()).toContain('same results as the page');
    await shot(page, 'sim-saved');

    // Opened back in the page, among its runs.
    await done.first().locator('.gateflow-open').click();
    await page.waitForSelector('#h-runs');
    expect(await page.locator('.run-item').count()).toBe(2);
    expect(await page.locator('.run-item').first().textContent()).toContain('GateFlow:');
    expect(errors).toEqual([]);
    expect(elsewhere).toEqual([]);
    await page.context().close();
  });

  it('says when the password is wrong, and keeps simulations to analysts and administrators', async () => {
    const { page, errors } = await open();
    await signIn(page, { login: product.staff.analyst.login, password: 'not-the-password' });
    await page.waitForSelector('#gateflow-error');
    expect(await page.textContent('#gateflow-error')).toBe(
      'The login or the password is not right.',
    );
    await signIn(page, product.staff.operator);
    await page.waitForSelector('#gateflow-not-allowed');
    expect(await page.locator('#gateflow-save').count()).toBe(0);
    // The failed sign-in is the only error the page saw: the browser logs its 401.
    expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
    expect(elsewhere).toEqual([]);
    await page.context().close();
  });
});
