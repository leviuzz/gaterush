// Builds GateFlow Simulator Studio as self-contained HTML pages: the scenario library, the worker,
// the styles and the code are all inside, so the page runs offline and never uses the network.
//
// dist/gateflow-studio.html           the downloadable page (a complete document, with a Content
//                                     Security Policy that forbids any connection)
// dist/gateflow-studio.artifact.html  the same page as the body of a claude.ai artifact, whose
//                                     frame provides the document and blocks downloads
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url);
const here = new URL('./', import.meta.url);
const version = JSON.parse(readFileSync(new URL('package.json', here), 'utf8')).version;

/** The files of the scenario library, by path relative to the repository. */
function libraryFiles() {
  const files = {};
  for (const folder of ['airports', 'scenarios', 'scenarios/flights']) {
    for (const name of readdirSync(new URL(`${folder}/`, root)).sort()) {
      if (!/\.(ya?ml|json|csv)$/i.test(name)) continue;
      files[`${folder}/${name}`] = readFileSync(new URL(`${folder}/${name}`, root), 'utf8');
    }
  }
  return files;
}

/** The source revision, as the CLI records it (ADR-014): `-dirty` when the tree differs. */
function commit() {
  const fromEnv = process.env.GATEFLOW_COMMIT ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    const head = git('rev-parse', 'HEAD');
    return git('status', '--porcelain') === '' ? head : `${head}-dirty`;
  } catch {
    return 'unknown';
  }
}

const common = {
  bundle: true,
  write: false,
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
};

/** Code safe inside an inline <script>: no "</script" and no "<!--" in the text. */
const inlineSafe = (code) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const worker = await build({
  ...common,
  entryPoints: [new URL('src/worker.ts', here).pathname],
  format: 'iife',
});
const workerSource = worker.outputFiles[0].text;

const style = await build({
  ...common,
  entryPoints: [new URL('src/page-style.ts', here).pathname],
  format: 'esm',
  platform: 'neutral',
  minify: false,
});
const { PAGE_STYLE } = await import(
  `data:text/javascript;base64,${Buffer.from(style.outputFiles[0].text).toString('base64')}`
);

async function app(downloads) {
  const result = await build({
    ...common,
    entryPoints: [new URL('src/main.tsx', here).pathname],
    format: 'iife',
    jsx: 'automatic',
    plugins: [
      {
        name: 'studio-build-constants',
        setup(b) {
          b.onResolve({ filter: /^studio:build$/ }, () => ({
            path: 'studio:build',
            namespace: 'studio',
          }));
          b.onLoad({ filter: /.*/, namespace: 'studio' }, () => ({
            loader: 'js',
            contents: [
              `export const LIBRARY_FILES = ${JSON.stringify(libraryFiles())};`,
              `export const WORKER_SOURCE = ${JSON.stringify(workerSource)};`,
              `export const STUDIO_VERSION = ${JSON.stringify(version)};`,
              `export const COMMIT = ${JSON.stringify(commit())};`,
              `export const DOWNLOADS = ${JSON.stringify(downloads)};`,
            ].join('\n'),
          }));
        },
      },
    ],
  });
  return inlineSafe(result.outputFiles[0].text);
}

const title = 'GateFlow Simulator Studio';
const description =
  'Simulate an airport security checkpoint day by day and compare today’s practice with GateFlow. Simulated results.';
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  'worker-src blob:',
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const page = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
  `<title>${title}</title>`,
  `<meta name="description" content="${description}">`,
  `<style>${PAGE_STYLE}</style>`,
  '</head>',
  '<body>',
  '<div id="root"></div>',
  `<script>${await app(true)}</script>`,
  '</body>',
  '</html>',
  '',
].join('\n');

const artifact = [
  `<title>${title}</title>`,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  `<style>${PAGE_STYLE}</style>`,
  '<div id="root"></div>',
  `<script>${await app(false)}</script>`,
  '',
].join('\n');

mkdirSync(new URL('dist/', here), { recursive: true });
writeFileSync(new URL('dist/gateflow-studio.html', here), page);
writeFileSync(new URL('dist/gateflow-studio.artifact.html', here), artifact);
const kb = (text) => `${Math.round(Buffer.byteLength(text) / 1024)} KB`;
console.log(
  `dist/gateflow-studio.html ${kb(page)}, dist/gateflow-studio.artifact.html ${kb(artifact)}`,
);
