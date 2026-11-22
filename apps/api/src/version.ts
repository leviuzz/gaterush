/** Keep in sync with package.json (checked by a test). */
export const API_VERSION = '0.20.0';

/** The source revision of the bundle, written by `build.mjs`; absent when run from source. */
declare const __GATEFLOW_COMMIT__: string | undefined;

/**
 * The source revision the server runs (S19), as results record it: the bundle's, from its build
 * (ADR-014: `-dirty` when the tree differed); from source, `GATEFLOW_COMMIT` or `GITHUB_SHA`, else
 * `unknown`.
 */
export const BUILD_COMMIT: string =
  typeof __GATEFLOW_COMMIT__ === 'string'
    ? __GATEFLOW_COMMIT__
    : (process.env.GATEFLOW_COMMIT ?? process.env.GITHUB_SHA ?? 'unknown');
