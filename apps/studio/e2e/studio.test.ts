import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * The built page in Chromium: it must give the CLI's results byte for byte (but for the name of
 * the program in the manifest), with workers or without, and for a scenario changed in the page.
 * It must never use the network. Build first: `pnpm build`.
 */

const studio = new URL('../dist/gateflow-studio.html', import.meta.url).href;
const cli = fileURLToPath(new URL('../../sim-cli/dist/gateflow-sim.mjs', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'gateflow-studio-e2e-'));
const LANE_POLICIES =
  'fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,priority-v3,priority-v3@predict';

let browser: Browser;
const network: string[] = [];

beforeAll(async () => {
  const executablePath = process.env.CHROMIUM_PATH;
  browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
});

afterAll(async () => {
  await browser.close();
});

async function open(options: { workers?: boolean; width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: options.width ?? 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on('request', (request) => {
    if (!/^(file|blob|data):/.test(request.url())) network.push(request.url());
  });
  if (options.workers === false) {
    await page.addInitScript(() => {
      // As in a frame that refuses workers: the page must run the days itself.
      (window as unknown as { Worker: unknown }).Worker = function refuse() {
        throw new Error('workers are not allowed here');
      };
    });
  }
  await page.goto(`${studio}#manual`);
  return page;
}

async function runInPage(page: Page, scenario: string, days: number): Promise<void> {
  await page.selectOption('#scenario', scenario);
  await page.fill('#days', String(days));
  await page.click('#run');
  await page.waitForSelector('#run-status[data-state="done"], #run-status[data-state="error"]', {
    timeout: 240_000,
  });
  expect(
    await page.getAttribute('#run-status', 'data-state'),
    (await page.textContent('#run-status')) ?? '',
  ).toBe('done');
}

async function saved(page: Page, button: string): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return readFileSync(await download.path(), 'utf8');
}

function runCli(scenarioFile: string, days: number, policies?: string): string {
  const out = mkdtempSync(join(work, 'cli-'));
  execFileSync(
    process.execPath,
    [
      cli,
      'run',
      '--scenario',
      scenarioFile,
      '--seeds',
      `1-${days}`,
      ...(policies === undefined ? [] : ['--policies', policies]),
      '--out',
      out,
      '--quiet',
    ],
    { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return readFileSync(join(out, 'results.json'), 'utf8');
}

/** The Studio's results with the generator of the CLI's: the only field that may differ. */
function asCli(studioJson: string, cliJson: string): string {
  const generator = (json: string) =>
    (JSON.parse(json) as { manifest: { generator: unknown } }).manifest.generator;
  expect(generator(studioJson)).toMatchObject({ name: 'gateflow-studio' });
  return studioJson.replace(
    JSON.stringify(generator(studioJson), null, 2).replace(/\n/g, '\n    '),
    JSON.stringify(generator(cliJson), null, 2).replace(/\n/g, '\n    '),
  );
}

describe('GateFlow Simulator Studio in the browser', () => {
  it('gives the results of the CLI, byte for byte but for the program name', async () => {
    const page = await open();
    await runInPage(page, 'scenarios/single-checkpoint-demo.yaml', 3);
    const fromPage = await saved(page, '#download-results');
    const fromCli = runCli('scenarios/single-checkpoint-demo.yaml', 3);
    expect(asCli(fromPage, fromCli)).toBe(fromCli);
    expect(
      await page.locator('#report').evaluate((e) => e.shadowRoot?.textContent ?? ''),
    ).toContain('SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA');
    await page.context().close();
  });

  it('gives them with extra lanes and the arrival forecast too, and without workers', async () => {
    const fromCli = runCli('scenarios/tsf-like-peak-day.yaml', 2, LANE_POLICIES);
    const page = await open();
    await runInPage(page, 'scenarios/tsf-like-peak-day.yaml', 2);
    expect(await page.textContent('#run-status')).toMatch(/on \d+ workers?/);
    expect(asCli(await saved(page, '#download-results'), fromCli)).toBe(fromCli);
    await page.context().close();
    const alone = await open({ workers: false });
    await runInPage(alone, 'scenarios/tsf-like-peak-day.yaml', 2);
    expect(await alone.textContent('#run-status')).toMatch(/on the page/);
    expect(asCli(await saved(alone, '#download-results'), fromCli)).toBe(fromCli);
    await alone.context().close();
  });

  it('runs a what-if the CLI reproduces from the scenario the page saves, and compares runs', async () => {
    const page = await open();
    await runInPage(page, 'scenarios/vce-like-peak-day.yaml', 2);
    await page.locator('#lever-screening').fill('26');
    await expect.poll(() => page.textContent('#h-levers')).toContain('Back to the scenario');
    await page.click('#run');
    await page.waitForSelector('#run-status[data-state="done"]', { timeout: 240_000 });
    const scenario = await saved(page, '#download-scenario');
    expect(JSON.parse(scenario)).toMatchObject({
      id: 'vce-like-peak-day-what-if',
      checkpoint: { serviceTimeMeanSeconds: { value: 26, source: 'SYNTHETIC' } },
    });
    const file = join(work, 'vce-like-peak-day-what-if.json');
    writeFileSync(file, scenario);
    const fromCli = runCli(file, 2, LANE_POLICIES);
    expect(asCli(await saved(page, '#download-results'), fromCli)).toBe(fromCli);
    // The two runs of the session side by side: the assumption that changed is listed.
    await expect
      .poll(() => page.locator('#compare-parameters').textContent())
      .toContain('checkpoint.serviceTimeMeanSeconds');
    await page.context().close();
  });

  it('fits a phone and never uses the network', async () => {
    const page = await open({ width: 390 });
    await runInPage(page, 'scenarios/tsf-like-peak-day.yaml', 2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.context().close();
    expect(network).toEqual([]);
  });
});
