// Builds the web application into dist/: index.html, assets/app.js and assets/app.css (with their
// Brotli and gzip copies, which the API serves to browsers that take them), an icon, and the
// licences of the libraries in the bundle. The API serves it (gateflow-api serve) under a Content
// Security Policy that allows the application's own files only.
//
//   node build.mjs            production build, no source maps
//   node build.mjs --watch    rebuilds on every change, with source maps
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { build, context } from 'esbuild';

const here = new URL('./', import.meta.url);
const dist = new URL('dist/', here);
const version = JSON.parse(readFileSync(new URL('package.json', here), 'utf8')).version;
const watch = process.argv.includes('--watch');

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0b57c4"/>
<path d="M18 46V18h28v28" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
<path d="M26 46V32h12v14" fill="#fff"/>
</svg>
`;

const INDEX = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<title>GateFlow</title>
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/app.css">
<script type="module" src="/assets/app.js"></script>
</head>
<body>
<div id="root"></div>
</body>
</html>
`;

/** MIT licences that ship without a licence file: their notice, from the source's header. */
const NOTICES_WITHOUT_FILE = {
  'qrcode-generator': 'Copyright (c) 2009 Kazuhiko Arase',
};

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** The npm package a bundled file comes from: its folder, name, version and licence. */
function packageOf(file) {
  let dir = dirname(file);
  while (dir.includes('node_modules')) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.name !== undefined && pkg.version !== undefined) return { dir, ...pkg };
    }
    dir = dirname(dir);
  }
  return null;
}

/** The licences of every npm package in the bundle, as their licences ask to be kept. */
function thirdPartyNotices(metafile) {
  const packages = new Map();
  for (const output of Object.values(metafile.outputs)) {
    for (const input of Object.keys(output.inputs)) {
      if (!input.includes('node_modules/')) continue;
      const pkg = packageOf(fileURLToPath(new URL(input, here)));
      if (pkg !== null) packages.set(`${pkg.name}@${pkg.version}`, pkg);
    }
  }
  const sections = [...packages.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((pkg) => {
      const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license']
        .map((name) => join(pkg.dir, name))
        .find((path) => existsSync(path));
      let text;
      if (file !== undefined) text = readFileSync(file, 'utf8').trim();
      else if (pkg.license === 'MIT' && NOTICES_WITHOUT_FILE[pkg.name] !== undefined) {
        text = `MIT License\n\n${NOTICES_WITHOUT_FILE[pkg.name]}\n\n${MIT}`;
      } else {
        throw new Error(`no licence text for ${pkg.name}: add it to NOTICES_WITHOUT_FILE`);
      }
      return `${pkg.name} ${pkg.version} (${pkg.license})\n\n${text}`;
    });
  return [
    `GateFlow web application ${version}: third-party software in assets/app.js`,
    '',
    ...sections.flatMap((s) => ['-'.repeat(78), s, '']),
  ].join('\n');
}

const options = {
  entryPoints: [fileURLToPath(new URL('src/main.tsx', here))],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'chrome110', 'edge110', 'safari16', 'firefox115'],
  outdir: fileURLToPath(new URL('assets/', dist)),
  entryNames: 'app',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
    __WEB_VERSION__: JSON.stringify(version),
  },
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL('assets/', dist), { recursive: true });
writeFileSync(new URL('index.html', dist), INDEX);
writeFileSync(new URL('assets/icon.svg', dist), ICON);

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  process.stdout.write('watching src/ (Ctrl+C to stop)\n');
} else {
  const result = await build(options);
  writeFileSync(
    new URL('assets/THIRD-PARTY-NOTICES.txt', dist),
    thirdPartyNotices(result.metafile),
  );
  const sizes = [];
  for (const name of ['app.js', 'app.css']) {
    const file = new URL(`assets/${name}`, dist);
    const content = readFileSync(file);
    const br = brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    });
    writeFileSync(new URL(`assets/${name}.br`, dist), br);
    writeFileSync(new URL(`assets/${name}.gz`, dist), gzipSync(content, { level: 9 }));
    sizes.push(
      `${name} ${Math.round(content.length / 1024)} KB (${Math.round(br.length / 1024)} KB br)`,
    );
  }
  process.stdout.write(`dist/assets: ${sizes.join(', ')}\n`);
}
