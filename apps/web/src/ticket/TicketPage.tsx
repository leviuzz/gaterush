import { isLocale, t } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import type { PublicTicketResponse, TicketState } from '@gateflow/contracts';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';

/*
 * The passenger's page of a ticket, opened from the QR code: the number, what to do now, and
 * nothing else. It holds no personal data, and it asks again every 15 seconds while the ticket is
 * open (and at once when the phone shows the page again).
 */

const POLL_MS = 15_000;
const FINAL: ReadonlySet<TicketState> = new Set(['ADMITTED', 'EXPIRED', 'CANCELLED']);
const LOCALE_KEY = 'gateflow.locale';

function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_KEY);
    return value !== null && isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // The choice holds for this visit only.
  }
}

export function TicketPage({
  ticketRef,
  defaultLocale,
}: {
  readonly ticketRef: string;
  readonly defaultLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(() => storedLocale() ?? defaultLocale);
  const [ticket, setTicket] = useState<PublicTicketResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useDocumentLanguage(locale);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const controller = new AbortController();
    const load = async () => {
      window.clearTimeout(timer);
      const answer = await api<PublicTicketResponse>(
        `/v1/tickets/${encodeURIComponent(ticketRef)}`,
        { signal: controller.signal },
      );
      if (stopped) return;
      if (answer.ok) {
        setTicket(answer.body);
        setMissing(false);
        setUpdatedAt(Date.now());
        if (FINAL.has(answer.body.state)) return;
      } else if (answer.status === 404) {
        setMissing(true);
        return;
      }
      if (!document.hidden) {
        timer = window.setTimeout(() => {
          void load();
        }, POLL_MS);
      }
    };
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void load();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ticketRef]);

  useEffect(() => {
    document.title = ticket === null ? 'GateFlow' : `${ticket.number} · GateFlow`;
  }, [ticket]);

  const choose = (l: Locale) => {
    setLocale(l);
    storeLocale(l);
  };

  return (
    <div className="ticket-page" data-state={ticket?.state ?? (missing ? 'MISSING' : 'LOADING')}>
      <header className="bar">
        <span className="brand">GateFlow</span>
        <LanguageSwitch locale={locale} onChange={choose} />
      </header>
      <main className="page-main">
        {missing ? (
          <section className="card message-card" id="ticket-missing">
            <p className="message">{t(locale, 'ticket.notFound')}</p>
          </section>
        ) : ticket === null ? (
          <div className="spinner" role="progressbar" aria-label="GateFlow" />
        ) : (
          <section className="card ticket-status" id="ticket-status">
            <p className="eyebrow">
              {t(locale, 'ticket.ticketFor', { checkpoint: ticket.checkpoint })}
            </p>
            <h1 className="number" id="ticket-number" data-length={ticket.number.length}>
              <span className="visually-hidden">{t(locale, 'ticket.title')}: </span>
              {ticket.number}
            </h1>
            <p className="state" id="ticket-state" role="status">
              {t(locale, `ticket.state.${ticket.state}`)}
            </p>
            {updatedAt === null ? null : (
              <p className="updated" id="ticket-updated">
                {t(locale, 'ticket.updated', { time: timeOfDay(updatedAt, locale) })}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
