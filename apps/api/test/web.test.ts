import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB_CSP, buildApp } from '../src/app';
import { freshDatabase } from './database';

/*
 * The API serves the web application (S14): its pages under a strict Content Security Policy,
 * its files with their compressed copies, and nothing else in the place of a missing file.
 */

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
const root = mkdtempSync(join(tmpdir(), 'gateflow-web-'));
const SCRIPT = `console.info(${JSON.stringify('x'.repeat(2000))});\n`;

beforeAll(async () => {
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>GateFlow</title>\n');
  writeFileSync(join(root, 'assets', 'app.js'), SCRIPT);
  writeFileSync(join(root, 'assets', 'app.js.br'), brotliCompressSync(SCRIPT));
  database = await freshDatabase();
  app = buildApp({ db: database.db, webRoot: root });
});

afterAll(async () => {
  await app.close();
  await database.close();
  rmSync(root, { recursive: true, force: true });
});

describe('the web application', () => {
  it("serves its pages with the application's own files only", async () => {
    for (const url of [
      '/',
      '/kiosk/0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b',
      '/t/AbCdEfGhIjKlMnOpQrStUv?lang=es',
    ]) {
      const page = await app.inject({ url });
      expect(page.statusCode, url).toBe(200);
      expect(page.headers['content-type']).toMatch(/^text\/html/);
      expect(page.body).toContain('<title>GateFlow</title>');
      expect(page.headers['content-security-policy']).toBe(WEB_CSP);
      expect(page.headers['x-content-type-options']).toBe('nosniff');
      expect(page.headers['referrer-policy']).toBe('no-referrer');
      expect(page.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    // No inline script, style or connection elsewhere; no frame may hold the page.
    expect(WEB_CSP).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(WEB_CSP).toContain("frame-ancestors 'none'");
    expect(WEB_CSP).toContain("connect-src 'self'");
  });

  it('gives a compressed copy to a browser that takes one', async () => {
    const plain = await app.inject({ url: '/assets/app.js' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body).toBe(SCRIPT);
    const br = await app.inject({ url: '/assets/app.js', headers: { 'accept-encoding': 'br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.rawPayload.length).toBeLessThan(SCRIPT.length / 4);
  });

  it('answers a missing file or route with a 404, never with a page', async () => {
    for (const url of ['/assets/missing.js', '/v1/nothing-here']) {
      const missing = await app.inject({ url });
      expect(missing.statusCode, url).toBe(404);
      expect(missing.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'no such route' } });
    }
    expect((await app.inject({ method: 'POST', url: '/kiosk/x' })).statusCode).toBe(404);
    // The API's answers are JSON, under the same headers but without the page's policy.
    const health = await app.inject({ url: '/v1/health' });
    expect(health.headers['content-security-policy']).toBeUndefined();
    expect(health.headers['x-content-type-options']).toBe('nosniff');
  });
});
