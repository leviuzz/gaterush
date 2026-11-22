import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticBoardingPass } from '@gateflow/bcbp';
import type { DemoFlightsResponse, OverviewResponse, ScanResponse } from '@gateflow/contracts';
import { MESSAGES, t } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { browserRandom } from '../src/random';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The supervisor's console in Chromium, on the product (S17): only supervisors and
 * administrators open it; a supervisor pauses the calls and starts again in order of arrival,
 * declares an emergency after a confirmation and resumes, moves a passenger up and calls one now
 * with a coded reason, sets the lanes open, reads the day's audit with who, what and why, and
 * checks the log's chain; an administrator activates another policy from the next service day.
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
  product = await startProduct(inject('databaseUrl'), 'vce-like-normal-day.yaml');
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true });
});

afterAll(async () => {
  await browser.close();
  await product.stop();
});

async function open(width = 1366, height = 900): Promise<{ page: Page; errors: string[] }> {
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
  await page.goto(`${product.base}/supervisor/${product.checkpointId}?lang=en`);
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

async function signIn(page: Page, who: 'operator' | 'supervisor' | 'admin'): Promise<void> {
  const { login, password } = product.staff[who];
  await page.waitForSelector('#supervisor-sign-in');
  await page.fill('#supervisor-login', login);
  await page.fill('#supervisor-password', password);
  await page.click('#supervisor-sign-in-submit');
}

/** A passenger takes a number at the kiosk (through the API, as the kiosk would). */
async function passenger(): Promise<string> {
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
  if (scanned.ticket === null) throw new Error('no ticket');
  return scanned.ticket.number;
}

const modeNow = (page: Page) => page.getAttribute('#console-mode-now', 'data-mode');

/** The overview as the API gives it to a supervisor (S20). */
async function overviewOfApi(): Promise<OverviewResponse> {
  const answer = await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/overview`, {
    headers: { cookie: product.staffCookie },
  });
  return (await answer.json()) as OverviewResponse;
}

describe("the supervisor's console (S17)", () => {
  it('is for supervisors and administrators only', async () => {
    const { page } = await open();
    await signIn(page, 'operator');
    await page.waitForSelector('#console-not-allowed');
    expect(await page.textContent('#console-not-allowed')).toBe(en['supervisor.notAllowed']);
    await page.context().close();
  });

  it('runs the modes, the overrides with their reason, the lanes and the audit', async () => {
    // A full window of numbers to get ready, and some waiting behind it.
    const numbers: string[] = [];
    for (let i = 0; i < 13; i++) numbers.push(await passenger());
    const { page, errors } = await open();
    await signIn(page, 'supervisor');
    await page.waitForSelector('.console[data-phase="ready"] #console-waiting li');
    expect(await modeNow(page)).toBe('NORMAL');
    expect(await page.getAttribute('#console-policy-today', 'data-policy')).toBe('priority-v3');

    // Pause, then start again in order of arrival.
    await page.click('#console-set-PAUSED');
    await page.waitForSelector('#console-mode-now[data-mode="PAUSED"]');
    expect(await page.textContent('#console-mode-banner')).toBe(en['lane.mode.PAUSED']);
    await page.click('#console-resume-reset');
    await page.waitForSelector('#console-mode-now[data-mode="NORMAL"]');

    // An emergency asks first.
    await page.click('#console-set-EMERGENCY');
    await page.waitForSelector('#console-emergency-confirm');
    await page.click('#console-emergency-cancel');
    expect(await page.locator('#console-emergency-confirm').count()).toBe(0);
    expect(await modeNow(page)).toBe('NORMAL');
    await page.click('#console-set-EMERGENCY');
    await page.click('#console-emergency-yes');
    await page.waitForSelector('#console-mode-now[data-mode="EMERGENCY"]');
    await shot(page, 'console-emergency');
    await page.click('#console-resume-same');
    await page.waitForSelector('#console-mode-now[data-mode="NORMAL"]');

    // An override needs a reason.
    const last = numbers.at(-1) ?? '';
    const waitingRow = page.locator(`#console-waiting [data-ticket="${last}"]`);
    const boost = waitingRow.locator('button', { hasText: en['supervisor.boost'] });
    expect(await boost.isDisabled()).toBe(true);
    await page.selectOption('#console-reason', 'AIRLINE_REQUEST');
    await boost.click();
    // The list can move with the stream before the answer comes: wait for both.
    await page.waitForSelector(`#console-prepare [data-ticket="${last}"]`);
    await page.waitForSelector(`#console-notice:has-text("${last}")`);
    expect(await page.textContent('#console-notice')).toBe(`${last}: ${en['supervisor.boost']}`);
    expect(await page.textContent(`#console-prepare [data-ticket="${last}"]`)).toContain(
      en['lane.overridden'],
    );
    // The reason is asked again for the next one.
    expect(await page.inputValue('#console-reason')).toBe('');
    const first = numbers[0] ?? '';
    await page.selectOption('#console-reason', 'ASSISTANCE');
    await page
      .locator(`#console-prepare [data-ticket="${first}"]`)
      .locator('button', { hasText: en['supervisor.callNow'] })
      .click();
    await page.waitForSelector(`#console-notice:has-text("${first}")`);
    expect(await page.locator(`#console-prepare [data-ticket="${first}"]`).count()).toBe(0);

    // The lanes open.
    await page.fill('#console-lanes-input', '3');
    await page.click('#console-lanes-set');
    await page.waitForSelector('#console-audit-list [data-command="SET_LANES"]');

    // The audit: who, what and why, the latest first.
    const latest = page.locator('#console-audit-list li').first();
    expect(await latest.getAttribute('data-command')).toBe('SET_LANES');
    expect(await latest.textContent()).toContain(product.staff.supervisor.login);
    const boosted = page.locator('#console-audit-list [data-command="OVERRIDE"]', {
      hasText: last,
    });
    expect(await boosted.textContent()).toContain(en['supervisor.reason.AIRLINE_REQUEST']);
    // A number's own history.
    await page.fill('#console-audit-number', last);
    await page.click('#console-audit-show');
    await page.waitForFunction(
      (n) =>
        [...document.querySelectorAll('#console-audit-list li')].every((li) =>
          li.textContent.includes(n),
        ),
      last,
    );
    const history = await page
      .locator('#console-audit-list li')
      .evaluateAll((items) => items.map((i) => i.getAttribute('data-command')));
    expect(history).toEqual(['OVERRIDE', 'ISSUE_TICKET']);
    await page.click('#console-audit-all');
    // The chain of the log.
    await page.click('#console-audit-verify');
    await page.waitForSelector('#console-audit-chain[data-kind="ok"]');
    await shot(page, 'console-supervisor');
    // Wide or narrow, nothing scrolls sideways.
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        String(width),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('shows the overview of the day, the figures of the API, checked against the log (S20)', async () => {
    await passenger();
    const { page, errors } = await open();
    await signIn(page, 'supervisor');
    await page.waitForSelector('#console-overview .kpi');
    // The page and the API on the same command of the log (the timers may add one meanwhile).
    let api = await overviewOfApi();
    for (let i = 0; i < 5; i++) {
      try {
        await page.waitForSelector(`#console-overview[data-seq="${String(api.seq)}"]`, {
          timeout: 5000,
        });
        break;
      } catch {
        api = await overviewOfApi();
      }
    }
    const waiting =
      api.tickets.waiting.people + api.tickets.prepare.people + api.tickets.called.people;
    expect(waiting).toBeGreaterThan(0);
    expect(await page.getAttribute('#kpi-waiting', 'data-people')).toBe(String(waiting));
    expect(await page.getAttribute('#kpi-lanes', 'data-lanes')).toBe(String(api.lanesOpen));
    const atRisk =
      api.atRisk.CRITICAL.people + api.atRisk.URGENT.people + api.atRisk.ATTENTION.people;
    expect(await page.getAttribute('#kpi-risk', 'data-people')).toBe(String(atRisk));
    const f = api.fairness;
    expect(await page.textContent('#console-fairness [data-figure="calledAhead"]')).toBe(
      t('en', 'supervisor.overview.calledAhead', {
        count: f.priorityCommitments,
        total: f.commitments,
        share: f.commitments === 0 ? 0 : Math.round((100 * f.priorityCommitments) / f.commitments),
      }),
    );
    // S17's test moved a passenger up with a reason: the monitor counts it.
    expect(f.overrides).toBeGreaterThan(0);
    expect(await page.textContent('#console-fairness [data-figure="overrides"]')).toBe(
      t('en', 'supervisor.overview.overrides', { count: f.overrides }),
    );
    expect(await page.textContent('#console-data [data-figure="flights"]')).toBe(
      t('en', 'supervisor.overview.flights', {
        flights: api.dataQuality.flights,
        feed: api.dataQuality.feed,
        rule: api.dataQuality.rule,
        none: api.dataQuality.none,
      }),
    );
    // Each number in the lists says how long it has waited.
    expect(
      await page.locator('#console-prepare li, #console-waiting li').first().textContent(),
    ).toMatch(/waiting \d+ min/);
    // The check against the log: the day replayed, every figure and every number.
    await page.click('#console-overview-verify');
    await page.waitForSelector('#console-overview-check');
    expect(await page.getAttribute('#console-overview-check', 'data-kind')).toBe('ok');
    expect(await page.textContent('#console-overview-check')).toMatch(
      /equals the log: \d+ commands/,
    );
    await shot(page, 'console-overview');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('lets an administrator activate a policy from the next service day', async () => {
    const { page, errors } = await open();
    await signIn(page, 'admin');
    await page.waitForSelector('#console-versions li[data-policy="virtual-fifo"] button');
    expect(await page.getAttribute('#console-policy-next', 'data-policy')).toBe('priority-v3');
    await page.click('#console-versions li[data-policy="virtual-fifo"] button');
    await page.waitForSelector('#console-policy-next[data-policy="virtual-fifo"]');
    // Today's day keeps the policy it opened with.
    expect(await page.getAttribute('#console-policy-today', 'data-policy')).toBe('priority-v3');
    await shot(page, 'console-admin');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('loads nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
