/** Constants the build (build.mjs) gives the page. */
declare module 'studio:build' {
  /** The scenario library: files of airports/, scenarios/ and scenarios/flights/, by path. */
  export const LIBRARY_FILES: Readonly<Record<string, string>>;
  /** Source of the Web Worker that simulates days. */
  export const WORKER_SOURCE: string;
  /** Version of the Studio and source revision it was built from (ADR-014). */
  export const STUDIO_VERSION: string;
  export const COMMIT: string;
}

/** True in the page GateFlow serves at `/sim` (S19), false in the offline pages (build.mjs). */
declare const __STUDIO_SERVER__: boolean;
