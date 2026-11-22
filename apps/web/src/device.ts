/*
 * A kiosk's credential. Whoever sets the kiosk up opens /kiosk/<checkpoint>#device=<token> once:
 * the token is kept in this browser and taken off the address at once, so it is not left on the
 * screen, in the history or in a bookmark. The fragment never reaches the server or its logs.
 */

const KEY = 'gateflow.device';
const FRAGMENT = /(?:^#|&)device=([A-Za-z0-9_-]{20,200})(?:&|$)/;

export function deviceToken(): string | null {
  const match = FRAGMENT.exec(window.location.hash);
  const given = match?.[1];
  if (given !== undefined) {
    try {
      window.localStorage.setItem(KEY, given);
    } catch {
      // Without storage the token works until the page is reloaded.
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return given;
  }
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Forgets the token of this browser (a revoked or replaced kiosk). */
export function forgetDeviceToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
}
