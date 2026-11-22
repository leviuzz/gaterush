import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REASON_CODES } from '@gateflow/priority-engine';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import { parseTraceFile, traceContent } from '@gateflow/sim-trace';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * The built page in Chromium: it must give the CLI's results byte for byte (but for the name of
 * the program in the manifest), with workers or without, and for a scenario changed in the page;
 * its replay of a day must be the CLI's trace of that day, every call with the engine's reason.
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

  it("replays a day of the run: the run's outcomes, every call's reason, the CLI's trace", async () => {
    const page = await open();
    await runInPage(page, 'scenarios/single-checkpoint-demo.yaml', 5);
    await page.waitForSelector('.replay', { timeout: 120_000 });
    // The replay opens on the typical day of GateFlow against the status quo.
    const results = JSON.parse(await saved(page, '#download-results')) as ResultsDocument;
    const seed = Number(await page.getAttribute('.replay', 'data-seed'));
    const nets = results.perSeed.map((d) => d.comparisons['priority-v3 vs fifo']?.net ?? NaN);
    const median = [...nets].sort((a, b) => a - b)[2];
    expect(nets[seed - 1]).toBe(median);
    // Its flights saved and lost are those of that day in the results.
    const day = results.perSeed.find((d) => d.seed === seed)?.comparisons['priority-v3 vs fifo'];
    expect(Number(await page.textContent('#replay-saved'))).toBe(day?.saved);
    expect(Number(await page.textContent('#replay-harmed'))).toBe(day?.harmed);
    // Every call shows a reason of the engine; a priority call, that the passenger was brought
    // forward.
    const reasons = () =>
      page
        .locator('#calls-list .call')
        .evaluateAll((calls) => calls.map((c) => c.getAttribute('data-reason')));
    await page.locator('#replay-time').fill(String(12 * 3_600_000));
    expect((await reasons()).length).toBeGreaterThan(0);
    for (const reason of await reasons()) expect(REASON_CODES).toContain(reason);
    await page.check('#calls-priority');
    const priority = await reasons();
    expect(priority.length).toBeGreaterThan(0);
    expect(new Set(priority)).toEqual(new Set(['URGENT_FEASIBLE']));
    // A saved passenger: their day with both policies, every call explained.
    await page.click('#list-saved');
    await page.locator('#table-saved button').first().click();
    const explained = await page
      .locator('#passenger [data-reason]')
      .evaluateAll((items) => items.map((i) => i.getAttribute('data-reason')));
    expect(explained.length).toBeGreaterThan(0);
    for (const reason of explained) expect(REASON_CODES).toContain(reason);
    expect(await page.textContent('#passenger')).toMatch(/Made the flight/);
    // The CLI traces the same day with the command the page gives: same fingerprint, same trace.
    await page.waitForSelector('#replay-fingerprint[data-ready="yes"]', {
      state: 'attached',
      timeout: 120_000,
    });
    const fingerprint = (await page.textContent('#replay-fingerprint')) ?? '';
    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    const command = ((await page.textContent('.reproduce')) ?? '').trim().split(/\s+/);
    expect(command[0]).toBe('gateflow-sim');
    const out = mkdtempSync(join(work, 'trace-'));
    const printed = execFileSync(process.execPath, [cli, ...command.slice(1), '--out', out], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(printed).toContain(`fingerprint ${fingerprint}`);
    await page.click('.trace-proof > summary');
    const fromPage = parseTraceFile(await saved(page, '#replay-save'));
    const fromCli = parseTraceFile(readFileSync(join(out, 'trace.json'), 'utf8'));
    expect(fromPage.manifest.generator.name).toBe('gateflow-studio');
    expect(traceContent(fromPage)).toBe(traceContent(fromCli));
    await page.context().close();
  });

  it('fits a phone and never uses the network', async () => {
    const page = await open({ width: 390 });
    await runInPage(page, 'scenarios/tsf-like-peak-day.yaml', 2);
    await page.waitForSelector('.replay', { timeout: 120_000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.context().close();
    expect(network).toEqual([]);
  });
});
