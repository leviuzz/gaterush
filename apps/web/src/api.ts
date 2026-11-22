/*
 * The API, from the browser. Answers are the API's contracts (@gateflow/contracts), taken as they
 * come: the server is the one that validates. Every failure is a value, never an exception, so a
 * screen always has something to show.
 */

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly body: T }
  /** `status` 0 is a network failure: the server could not be reached. */
  | { readonly ok: false; readonly status: number; readonly code: string };

export interface ApiRequest {
  readonly method?: 'GET' | 'POST';
  /** The device token, sent as `Authorization: Bearer`. */
  readonly token?: string;
  readonly body?: unknown;
  /** The same key on a retry: the server applies the command once. */
  readonly idempotencyKey?: string;
  /** Sends the staff's session cookie (S15); passengers' and kiosks' requests carry no cookie. */
  readonly session?: boolean;
  readonly signal?: AbortSignal;
}

export async function api<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (request.token !== undefined) headers.Authorization = `Bearer ${request.token}`;
  if (request.idempotencyKey !== undefined) headers['Idempotency-Key'] = request.idempotencyKey;
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(path, {
      method: request.method ?? 'GET',
      headers,
      cache: 'no-store',
      credentials: request.session === true ? 'same-origin' : 'omit',
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK' };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An answer without JSON (a proxy's error page): only its status counts.
  }
  if (response.ok) return { ok: true, status: response.status, body: body as T };
  const given =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: { code?: unknown } }).error.code
      : undefined;
  const code = typeof given === 'string' ? given : 'ERROR';
  return { ok: false, status: response.status, code };
}

/**
 * A random key, from the browser's generator: unlike `crypto.randomUUID`, it also works on a page
 * served without TLS, as on a kiosk of a local network.
 */
export function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
