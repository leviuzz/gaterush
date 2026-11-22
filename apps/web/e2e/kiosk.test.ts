import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { syntheticBoardingPass } from '@gateflow/bcbp';
import type { BoardingPassInput } from '@gateflow/bcbp';
import type { DemoFlightsResponse, PublicTicketResponse, ScanResponse } from '@gateflow/contracts';
import { LOCALES, MESSAGES, t } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { qrPath } from '../src/common/qr';
import { browserRandom } from '../src/random';
import { startProduct } from './product';
import type { Product } from './product';

/*
 * The kiosk and the passenger's page in Chromium, on the product itself: the gateflow-api bundle
 * on PostgreSQL, serving the built web application. A passenger scans a boarding pass, takes a
 * number, follows it on a phone in their language and is told when to go; the pass leaves nothing
 * in the page or the browser; nothing is loaded from anywhere else. Build first: `pnpm build`.
 *
 * With GATEFLOW_SHOTS set to a folder, the screens are saved there to be looked at.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const SHOTS = process.env.GATEFLOW_SHOTS;

let product: Product;
let browser: Browser;
/** Every request a page made to another server: there must be none. */
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
  /** Errors the page logged: a refused script or style, a failed request, an exception. */
  readonly errors: string[];
}

async function open(
  path: string,
  options: { width?: number; height?: number; colorScheme?: 'light' | 'dark' } = {},
): Promise<Opened> {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1080, height: options.height ?? 1920 },
    locale: 'en-GB',
    colorScheme: options.colorScheme ?? 'light',
    // Screens saved for people to look at are sharp; the layout is the same.
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

const kiosk = () => `/kiosk/${product.checkpointId}`;

async function openKiosk(
  lang: Locale = 'en',
  size: { width: number; height: number } = { width: 1080, height: 1920 },
): Promise<Opened> {
  const opened = await open(`${kiosk()}?lang=${lang}#device=${product.kioskToken}`, size);
  await opened.page.waitForSelector('#kiosk-welcome');
  return opened;
}

/**
 * Saves a screen for people to look at. A screenshot is no check of the page: when the browser
 * cannot take one (it happens on CI runners), it tries once more, then says so and goes on.
 */
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.screenshot({ path: join(SHOTS, `${name}.png`) });
      return;
    } catch (error) {
      if (attempt === 2) {
        process.stdout.write(`screenshot ${name} not saved: ${(error as Error).message}\n`);
      }
    }
  }
}

/** As a keyboard-wedge scanner reads a pass: keystrokes wherever the focus is, then Enter. */
async function scan(page: Page, text: string): Promise<void> {
  const before = Number(await page.getAttribute('.kiosk', 'data-answers'));
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForSelector(`.kiosk[data-answers="${String(before + 1)}"]`);
}

async function demoFlights(): Promise<DemoFlightsResponse> {
  const response = await fetch(
    `${product.base}/v1/checkpoints/${product.checkpointId}/demo-flights`,
    { headers: { authorization: `Bearer ${product.kioskToken}` } },
  );
  return (await response.json()) as DemoFlightsResponse;
}

/** A synthetic boarding pass for one of today's demo flights, `days` after today if asked. */
async function passForToday(
  options: { from?: string; days?: number; flightNumber?: string } = {},
): Promise<{ text: string; input: BoardingPassInput }> {
  const demo = await demoFlights();
  const later = demo.flights.filter((f) => Date.parse(f.departure) > Date.now() + 30 * 60_000);
  const flight = (later.length > 0 ? later : demo.flights)[0];
  if (flight === undefined) throw new Error('no demo flight in the next 24 hours');
  const [year = 0, month = 0, day = 0] = flight.date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + (options.days ?? 0)));
  return syntheticBoardingPass(browserRandom(), [
    {
      from: options.from ?? 'VCE',
      to: 'CDG',
      carrier: flight.carrier,
      flightNumber: options.flightNumber ?? flight.flightNumber,
      date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    },
  ]);
}

async function ticketOf(ref: string): Promise<PublicTicketResponse> {
  return (await (await fetch(`${product.base}/v1/tickets/${ref}`)).json()) as PublicTicketResponse;
}

const refOf = (url: string | null): string => {
  const ref = /\/t\/([A-Za-z0-9_-]+)$/.exec(url ?? '')?.[1];
  if (ref === undefined) throw new Error(`no ticket reference in ${String(url)}`);
  return ref;
};

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** The ticket's number is whole on one line, inside its card. */
const numberFits = (page: Page) =>
  page.evaluate(() => {
    const number = document.querySelector('#ticket-number');
    return number !== null && number.scrollWidth <= number.clientWidth;
  });

describe('the kiosk', () => {
  it('is not set up without the token of a kiosk of this checkpoint', async () => {
    for (const path of [
      kiosk(),
      `${kiosk()}#device=${'x'.repeat(43)}`,
      `${kiosk()}#device=${product.displayToken}`,
      `/kiosk/0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b#device=${product.kioskToken}`,
    ]) {
      const { page } = await open(path);
      await page.waitForSelector('#kiosk-not-set-up');
      expect(await page.textContent('#kiosk-not-set-up'), path).toBe(MESSAGES.en['kiosk.notSetUp']);
      expect(await page.locator('#kiosk-code').count()).toBe(0);
      await page.context().close();
    }
  });

  it('takes its token from the address once, then from this browser only', async () => {
    const { page, errors } = await openKiosk('en');
    // The token is off the address at once: not on the screen, in the history or a bookmark.
    expect(page.url()).toBe(`${product.base}${kiosk()}?lang=en`);
    expect(await page.evaluate(() => localStorage.getItem('gateflow.device'))).toBe(
      product.kioskToken,
    );
    await page.reload();
    await page.waitForSelector('#kiosk-welcome');
    expect(await page.textContent('#kiosk-welcome h1')).toBe(MESSAGES.en['kiosk.title']);
    expect(await page.textContent('.demo-badge')).toBe(MESSAGES.en['kiosk.demo']);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('kiosk-code');
    await shot(page, 'kiosk-welcome-portrait');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('gives a number for a sample boarding pass, with a QR code to its page', async () => {
    const { page, errors } = await openKiosk('en');
    await page.click('#kiosk-sample');
    await page.waitForSelector('#kiosk-ticket');
    const number = (await page.textContent('#ticket-number'))?.trim();
    expect(number).toMatch(/^A\d{3}$/);
    expect(await page.textContent('#ticket-heading')).toBe(MESSAGES.en['kiosk.issued']);
    const url = await page.getAttribute('[data-ticket-url]', 'data-ticket-url');
    expect(url).toBe(`${product.base}/t/${refOf(url)}`);
    // The QR code is that address, and only it: drawn again here from the same text.
    expect(await page.getAttribute('svg.qr path', 'd')).toBe(qrPath(url ?? '').path);
    const ticket = await ticketOf(refOf(url));
    expect(ticket.number).toBe(number);
    expect(['QUEUED', 'PREPARE']).toContain(ticket.state);
    await shot(page, 'kiosk-ticket-portrait');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('gives the same number to the same boarding pass, read by a scanner', async () => {
    const { page, errors } = await openKiosk('en');
    const pass = await passForToday();
    await scan(page, pass.text);
    expect(await page.textContent('#ticket-heading')).toBe(MESSAGES.en['kiosk.issued']);
    const first = await page.textContent('#ticket-number');
    const url = await page.getAttribute('[data-ticket-url]', 'data-ticket-url');
    // Straight from the ticket's screen, as the next scan would come.
    await scan(page, pass.text);
    expect(await page.textContent('#ticket-heading')).toBe(MESSAGES.en['kiosk.retrieved']);
    expect(await page.textContent('#ticket-number')).toBe(first);
    expect(await page.getAttribute('[data-ticket-url]', 'data-ticket-url')).toBe(url);
    // Nothing of the pass stays in the page or the browser: no name, booking reference or code.
    const html = await page.content();
    const stored = await page.evaluate(() =>
      JSON.stringify(
        [localStorage, sessionStorage].map((storage) =>
          Array.from({ length: storage.length }, (_, i) => {
            const key = storage.key(i) ?? '';
            return [key, storage.getItem(key)];
          }),
        ),
      ),
    );
    const leg = pass.input.legs[0];
    for (const secret of [pass.input.passengerName, leg?.pnr ?? '', pass.text]) {
      expect(html).not.toContain(secret);
      expect(stored).not.toContain(secret);
    }
    expect(await page.inputValue('#kiosk-code')).toBe('');
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it("says in the passenger's language why a boarding pass gives no ticket", async () => {
    const { page, errors } = await openKiosk('en');
    await page.click('button[lang="it"]');
    expect(await page.textContent('#kiosk-welcome h1')).toBe(MESSAGES.it['kiosk.title']);
    await scan(page, (await passForToday({ from: 'MXP' })).text);
    expect(await page.textContent('#kiosk-reason')).toBe(MESSAGES.it['kiosk.reason.WRONG_AIRPORT']);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('it');
    await shot(page, 'kiosk-refused-it');
    // Back to the kiosk's own language for the next passenger.
    await page.click('#kiosk-again');
    expect(await page.textContent('#kiosk-welcome h1')).toBe(MESSAGES.en['kiosk.title']);
    await page.click('button[lang="es"]');
    const cases: [string, string][] = [
      ['THIS IS NOT A BOARDING PASS', 'kiosk.reason.UNREADABLE'],
      [(await passForToday({ days: 3 })).text, 'kiosk.reason.WRONG_DAY'],
      [(await passForToday({ flightNumber: '9999' })).text, 'kiosk.reason.UNKNOWN_FLIGHT'],
    ];
    for (const [text, key] of cases) {
      await scan(page, text);
      expect(await page.textContent('#kiosk-reason'), key).toBe(
        MESSAGES.es[key as keyof (typeof MESSAGES)['es']],
      );
    }
    expect(errors).toEqual([]);
    await page.context().close();
  });

  it('shows its privacy notice, marked as a draft', async () => {
    const { page } = await openKiosk('es');
    await page.click('#kiosk-privacy');
    await page.waitForSelector('dialog.privacy[open]');
    expect(await page.textContent('#privacy-title')).toBe(MESSAGES.es['kiosk.privacy.title']);
    expect(await page.textContent('dialog.privacy .draft')).toBe(
      MESSAGES.es['kiosk.privacy.draft'],
    );
    await shot(page, 'kiosk-privacy-es');
    await page.click('#privacy-close');
    await page.waitForSelector('dialog.privacy:not([open])', { state: 'attached' });
    // The scanner's field has the focus again.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('kiosk-code');
    await page.context().close();
  });

  it('prints the number with its QR code, and nothing else', async () => {
    const { page } = await openKiosk('it');
    await page.click('#kiosk-sample');
    await page.waitForSelector('#kiosk-ticket');
    await page.emulateMedia({ media: 'print' });
    for (const shown of ['#ticket-number', 'svg.qr', '.issued-at']) {
      expect(await page.isVisible(shown), shown).toBe(true);
    }
    for (const hidden of ['.bar', '.scan-form', '.kiosk-foot', '.actions']) {
      expect(await page.isVisible(hidden), hidden).toBe(false);
    }
    // On an 80 mm roll, one ticket is one page.
    const pdf = (await page.pdf({ width: '80mm', printBackground: true })).toString('latin1');
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
    await page.context().close();
  });

  it('fits a long number on its screen', async () => {
    const { page } = await openKiosk('en', { width: 1080, height: 1920 });
    const ticket = {
      id: '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b',
      number: 'ABC1000',
      state: 'QUEUED',
    };
    await page.route('**/scans', (route) =>
      route.fulfill({
        status: 201,
        json: { outcome: 'ISSUED', reason: null, ticket, ref: 'AbCdEfGhIjKlMnOpQrStUv' },
      }),
    );
    await scan(page, 'M1SAMPLE');
    expect(await page.textContent('#ticket-number')).toBe('ABC1000');
    expect(await numberFits(page)).toBe(true);
    await page.context().close();
  });

  it('fits portrait and landscape screens without scrolling', async () => {
    for (const size of [
      { width: 1080, height: 1920 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
    ]) {
      const name = `${String(size.width)}x${String(size.height)}`;
      const { page, errors } = await openKiosk('it', size);
      expect(await noOverflow(page), name).toBe(true);
      await page.click('#kiosk-sample');
      await page.waitForSelector('#kiosk-ticket');
      await shot(page, `kiosk-ticket-${name}`);
      expect(await noOverflow(page), name).toBe(true);
      expect(await numberFits(page), name).toBe(true);
      // The whole ticket on screen: the screen's own height without its stretching (min-height).
      const { needed, height } = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.kiosk');
        if (root === null) return { needed: Infinity, height: window.innerHeight };
        root.style.minHeight = '0';
        const natural = root.getBoundingClientRect().height;
        root.style.minHeight = '';
        return { needed: natural, height: window.innerHeight };
      });
      process.stdout.write(
        `${name}: ${String(Math.round((100 * needed) / height))}% of the height\n`,
      );
      expect(needed, `${name}: the whole ticket on screen`).toBeLessThanOrEqual(height);
      expect(errors).toEqual([]);
      await page.context().close();
    }
  });
});

describe("the passenger's page", () => {
  it('follows the number on a phone in Italian, English and Spanish', async () => {
    const pass = await passForToday();
    const answer = await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/scans`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${product.kioskToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bcbp: pass.text }),
    });
    const scanned = (await answer.json()) as ScanResponse;
    const ref = scanned.ref ?? '';
    for (const locale of LOCALES) {
      for (const colorScheme of ['light', 'dark'] as const) {
        const { page, errors } = await open(`/t/${ref}?lang=${locale}`, {
          width: 360,
          height: 740,
          colorScheme,
        });
        await page.waitForSelector('#ticket-status');
        const ticket = await ticketOf(ref);
        expect(await page.textContent('#ticket-state')).toBe(
          t(locale, `ticket.state.${ticket.state}`),
        );
        expect(await page.textContent('#ticket-status .eyebrow')).toBe(
          t(locale, 'ticket.ticketFor', { checkpoint: ticket.checkpoint }),
        );
        expect(await page.textContent('#ticket-number')).toContain(ticket.number);
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(locale);
        expect(await noOverflow(page), `${locale} ${colorScheme}`).toBe(true);
        expect(await numberFits(page), `${locale} ${colorScheme}`).toBe(true);
        await shot(page, `ticket-page-${locale}-${colorScheme}`);
        expect(errors).toEqual([]);
        await page.context().close();
      }
    }
    // The passenger's choice of language stays with their phone.
    const { page } = await open(`/t/${ref}`, { width: 390, height: 844 });
    await page.waitForSelector('#ticket-status');
    await page.click('button[lang="es"]');
    await page.reload();
    await page.waitForSelector('#ticket-status');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
    await page.context().close();
    // Past 999 tickets of a day, with a prefix of three letters, the number still fits.
    for (const number of ['A1000', 'ABC1000']) {
      const long = await open(`/t/${ref}?lang=it`, { width: 320, height: 640 });
      await long.page.route('**/v1/tickets/*', (route) =>
        route.fulfill({
          json: { number, state: 'QUEUED', checkpoint: 'T1', serviceDay: product.calendarDay },
        }),
      );
      await long.page.reload();
      await long.page.waitForSelector('#ticket-status');
      expect(await long.page.textContent('#ticket-number')).toContain(number);
      expect(await numberFits(long.page), number).toBe(true);
      expect(await noOverflow(long.page), number).toBe(true);
      await long.page.context().close();
    }
    // A reference that is no ticket.
    const missing = await open(`/t/${'x'.repeat(22)}?lang=it`, { width: 360, height: 740 });
    await missing.page.waitForSelector('#ticket-missing');
    expect(await missing.page.textContent('#ticket-missing')).toBe(MESSAGES.it['ticket.notFound']);
    await missing.page.context().close();
  });

  it('tells the passenger when to go, and the kiosk knows they went through', async () => {
    // The passenger takes a number at the kiosk and opens its page on their phone.
    const { page: kioskPage } = await openKiosk('en');
    const pass = await passForToday();
    await scan(kioskPage, pass.text);
    const ref = refOf(await kioskPage.getAttribute('[data-ticket-url]', 'data-ticket-url'));
    const { page, errors } = await open(`/t/${ref}?lang=en`, { width: 390, height: 844 });
    await page.waitForSelector('#ticket-status');
    // Staff call the next passenger until it is this one: the engine chooses the order.
    for (let calls = 0; calls < 60 && (await ticketOf(ref)).state !== 'CALLED'; calls++) {
      await fetch(`${product.base}/v1/checkpoints/${product.checkpointId}/calls`, {
        method: 'POST',
        headers: { cookie: product.staffCookie },
      });
    }
    expect((await ticketOf(ref)).state).toBe('CALLED');
    // The page asks again by itself, every 15 seconds.
    await page.waitForFunction(
      (text) => document.querySelector('#ticket-state')?.textContent === text,
      MESSAGES.en['ticket.state.CALLED'],
      { timeout: 30_000 },
    );
    expect(await page.getAttribute('.ticket-page', 'data-state')).toBe('CALLED');
    await shot(page, 'ticket-page-called');
    // Through the access point; the page says so, and stops asking.
    const admitted = await fetch(
      `${product.base}/v1/checkpoints/${product.checkpointId}/admissions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: product.staffCookie },
        body: JSON.stringify({ ref }),
      },
    );
    expect(((await admitted.json()) as { outcome: string }).outcome).toBe('ADMITTED');
    await page.reload();
    await page.waitForSelector('.ticket-page[data-state="ADMITTED"]');
    expect(await page.textContent('#ticket-state')).toBe(MESSAGES.en['ticket.state.ADMITTED']);
    // The same pass at the kiosk again: staff must see this passenger.
    await scan(kioskPage, pass.text);
    expect(await kioskPage.textContent('#kiosk-reason')).toBe(
      MESSAGES.en['kiosk.reason.ALREADY_ADMITTED'],
    );
    expect(errors).toEqual([]);
    await page.context().close();
    await kioskPage.context().close();
  });
});

describe('the pages', () => {
  it('load nothing from anywhere else', () => {
    expect(elsewhere).toEqual([]);
  });
});
