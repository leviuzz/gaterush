/**
 * Architectural boundaries of the GateFlow monorepo (see ARCHITECTURE.md, "Dependency rules").
 *
 * Production code in packages/* must stay pure: no Node.js built-ins (it must also run in the
 * browser) and only the explicitly allowed workspace and npm dependencies. Test files are not
 * subject to these rules.
 */

/**
 * Patterns matching an npm package resolved through pnpm's virtual store or a plain node_modules
 * folder. Kept as two flat patterns: nested quantifiers are rejected as unsafe regular expressions.
 */
const npm = (name) => [
  `^node_modules/${name}/`,
  `^node_modules/\\.pnpm/${name}@[^/]+/node_modules/${name}/`,
];

/** Builds a rule allowing a package's src to import only the listed workspace packages and npm modules. */
function onlyAllowed(pkg, workspaceDeps, npmDeps = []) {
  const allowedPackages = [pkg, ...workspaceDeps].join('|');
  const allowedNpm = npmDeps.flatMap(npm);
  return {
    name: `${pkg}-allowed-dependencies`,
    comment: `packages/${pkg} may depend only on: ${[...workspaceDeps, ...npmDeps].join(', ') || 'nothing'}.`,
    severity: 'error',
    from: { path: `^packages/${pkg}/src/` },
    to: {
      path: `^(?:packages/(?!(?:${allowedPackages})/)|node_modules/)`,
      ...(allowedNpm.length > 0 ? { pathNot: allowedNpm } : {}),
    },
  };
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the dependency graph impossible to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'Every import must resolve: catches typos and dependencies missing from package.json.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'pure-packages-no-node-builtins',
      severity: 'error',
      comment:
        'Pure packages must behave identically in Node.js and in the browser: no Node.js built-ins.',
      from: { path: '^packages/[^/]+/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'packages-do-not-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'src-does-not-import-tests',
      severity: 'error',
      from: { path: '/src/' },
      to: { path: '/test/' },
    },
    onlyAllowed('domain', []),
    onlyAllowed('sim-kernel', []),
    onlyAllowed('priority-engine', ['domain']),
    onlyAllowed('sim-model', ['domain', 'priority-engine', 'sim-kernel']),
    onlyAllowed(
      'sim-scenarios',
      ['domain', 'priority-engine', 'sim-kernel', 'sim-model'],
      ['zod', 'yaml'],
    ),
    onlyAllowed('sim-metrics', [
      'domain',
      'priority-engine',
      'sim-kernel',
      'sim-model',
      'sim-scenarios',
    ]),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|\\.turbo)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
