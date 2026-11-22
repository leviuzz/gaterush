import { isLocale, localeFor } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import { Home } from './common/Home';
import { Demo } from './demo/Demo';
import { Display } from './display/Display';
import { Kiosk } from './kiosk/Kiosk';
import { Lane } from './lane/Lane';
import { Console } from './supervisor/Console';
import { TicketPage } from './ticket/TicketPage';

export type Route =
  | { readonly page: 'kiosk'; readonly checkpointId: string }
  | { readonly page: 'display'; readonly checkpointId: string }
  | { readonly page: 'lane'; readonly checkpointId: string }
  | { readonly page: 'supervisor'; readonly checkpointId: string }
  | { readonly page: 'ticket'; readonly ref: string }
  | { readonly page: 'demo' }
  | { readonly page: 'home' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The opaque reference of a ticket, as its QR code carries it. */
const REF = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * The page of an address: /kiosk/<checkpoint id>, /display/<checkpoint id>, /lane/<checkpoint
 * id>, /supervisor/<checkpoint id>, /t/<ticket reference>, /demo (the digital twin, S18), or the
 * home page.
 */
export function routeOf(pathname: string): Route {
  const station = /^\/(kiosk|display|lane|supervisor)\/([^/]+)\/?$/.exec(pathname);
  const page = station?.[1];
  const id = station?.[2];
  if (
    (page === 'kiosk' || page === 'display' || page === 'lane' || page === 'supervisor') &&
    id !== undefined &&
    UUID.test(id)
  ) {
    return { page, checkpointId: id.toLowerCase() };
  }
  if (/^\/demo\/?$/.test(pathname)) return { page: 'demo' };
  const ticket = /^\/t\/([^/]+)\/?$/.exec(pathname)?.[1];
  if (ticket !== undefined && REF.test(ticket)) return { page: 'ticket', ref: ticket };
  return { page: 'home' };
}

/** The language of `?lang=`, else the first of the reader's languages GateFlow speaks. */
function initialLocale(search: URLSearchParams): Locale {
  const asked = search.get('lang');
  if (asked !== null && isLocale(asked)) return asked;
  return localeFor(navigator.languages);
}

export function App() {
  const route = routeOf(window.location.pathname);
  const search = new URLSearchParams(window.location.search);
  const locale = initialLocale(search);
  switch (route.page) {
    case 'kiosk':
      return (
        <Kiosk
          checkpointId={route.checkpointId}
          defaultLocale={locale}
          autoPrint={search.get('print') === 'auto'}
        />
      );
    case 'display':
      return <Display checkpointId={route.checkpointId} locale={locale} />;
    case 'lane':
      return <Lane checkpointId={route.checkpointId} defaultLocale={locale} />;
    case 'supervisor':
      return <Console checkpointId={route.checkpointId} defaultLocale={locale} />;
    case 'ticket':
      return <TicketPage ticketRef={route.ref} defaultLocale={locale} />;
    case 'demo':
      return <Demo defaultLocale={locale} />;
    case 'home':
      return <Home />;
  }
}
