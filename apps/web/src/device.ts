/*
 * A device's credential: a kiosk's or a display's. Whoever sets the device up opens
 * /kiosk/<checkpoint>#device=<token> (or /display/...) once: the token is kept in this browser and
 * taken off the address at once, so it is not left on the screen, in the history or in a
 * bookmark. The fragment never reaches the server or its logs.
 */

export type DeviceScreen = 'kiosk' | 'display';

const FRAGMENT = /(?:^#|&)device=([A-Za-z0-9_-]{20,200})(?:&|$)/;

/** Where this browser keeps the token of a screen: a kiosk's as before S16. */
const keyOf = (screen: DeviceScreen) =>
  screen === 'kiosk' ? 'gateflow.device' : `gateflow.device.${screen}`;

export function deviceToken(screen: DeviceScreen = 'kiosk'): string | null {
  const match = FRAGMENT.exec(window.location.hash);
  const given = match?.[1];
  if (given !== undefined) {
    try {
      window.localStorage.setItem(keyOf(screen), given);
    } catch {
      // Without storage the token works until the page is reloaded.
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return given;
  }
  try {
    return window.localStorage.getItem(keyOf(screen));
  } catch {
    return null;
  }
}

/** Forgets the token of this browser (a revoked or replaced device). */
export function forgetDeviceToken(screen: DeviceScreen = 'kiosk'): void {
  try {
    window.localStorage.removeItem(keyOf(screen));
  } catch {
    // nothing kept
  }
}
