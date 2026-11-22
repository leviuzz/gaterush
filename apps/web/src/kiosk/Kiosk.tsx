import { t } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import type {
  DemoFlightsResponse,
  DeviceResponse,
  ScanReason,
  ScanResponse,
} from '@gateflow/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { api, randomKey } from '../api';
import { dateAndTime, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { QrCode } from '../common/QrCode';
import { deviceToken, forgetDeviceToken } from '../device';
import { samplePass } from './sample';

/*
 * The kiosk at a checkpoint: a passenger scans a boarding pass and gets a number, on screen with a
 * QR code to follow it on a phone, and on paper. A keyboard-wedge scanner types the pass into the
 * field and ends it with Enter; staff can type or paste a code. The pass goes to the server and is
 * forgotten: the kiosk keeps nothing of it. People travelling together scan their other passes
 * onto the same number (S15): the queue then counts the people it will call.
 */

/** A number on the screen. */
interface ShownTicket {
  /** A new number, the same number again, or a no-show back in the queue (S15). */
  readonly heading: 'kiosk.issued' | 'kiosk.retrieved' | 'kiosk.reactivated';
  readonly number: string;
  readonly ref: string;
  readonly atMs: number;
  readonly flightId: string;
  /** The people on the number (S15). */
  readonly partySize: number;
  /** Whether more people may join it: while it waits to be called (S15). */
  readonly canGrow: boolean;
}

/**
 * What the latest scan of a party's pass did (S15): added one person, an adult with the infant on
 * the pass (two), or an infant counted already from an adult's pass (ADR-046).
 */
type PartyStatus =
  | 'ready'
  | 'reading'
  | 'added'
  | 'addedInfant'
  | 'infantCounted'
  | 'already'
  | 'error'
  | ScanReason;

type Screen =
  | { readonly kind: 'starting' }
  | { readonly kind: 'not-set-up' }
  /** The server could not be reached at start: the kiosk tries again by itself. */
  | { readonly kind: 'offline' }
  | { readonly kind: 'welcome' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ticket'; readonly ticket: ShownTicket }
  /** The passes of those travelling together join the number on screen (S15). */
  | { readonly kind: 'party'; readonly ticket: ShownTicket; readonly status: PartyStatus }
  | { readonly kind: 'refused'; readonly reason: ScanReason }
  | { readonly kind: 'error' };

/** How long a result stays on screen before the kiosk is ready for the next passenger. */
const TICKET_SECONDS = 45;
/** How long the screen of a party waits for its next pass. */
const PARTY_SECONDS = 60;
const REFUSAL_SECONDS = 20;
const RETRY_SECONDS = 5;
const MAX_PASS_LENGTH = 1100;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

/** A button that leaves the focus in the scanner's field. */
function KioskButton({
  className,
  onClick,
  children,
  id,
}: {
  readonly className?: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly id?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      id={id}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function PassIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 160 96" aria-hidden="true">
      <rect x="8" y="16" width="104" height="64" rx="8" className="ill-pass" />
      <rect x="20" y="30" width="44" height="6" rx="3" className="ill-line" />
      <rect x="20" y="44" width="30" height="6" rx="3" className="ill-line" />
      <g className="ill-code">
        {[0, 4, 6, 10, 14, 16, 20, 24, 26, 30].map((x) => (
          <rect key={x} x={72 + x} y="28" width="2" height="40" />
        ))}
      </g>
      <rect x="118" y="8" width="34" height="80" rx="7" className="ill-phone" />
      <rect x="125" y="28" width="20" height="20" className="ill-code-solid" />
      <path d="M 60 88 L 100 88" className="ill-beam" />
    </svg>
  );
}

export function Kiosk({
  checkpointId,
  defaultLocale,
  autoPrint,
}: {
  readonly checkpointId: string;
  readonly defaultLocale: Locale;
  readonly autoPrint: boolean;
}) {
  const [token] = useState(() => deviceToken());
  const [me, setMe] = useState<DeviceResponse | null>(null);
  const [demo, setDemo] = useState<DemoFlightsResponse | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'starting' });
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [code, setCode] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** How many scans have had an answer: a new answer is a new number here. */
  const [answers, setAnswers] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);

  useDocumentLanguage(locale);
  useEffect(() => {
    // A kiosk stands in a bright hall and prints in black: always the light theme.
    document.documentElement.dataset.theme = 'light';
  }, []);

  // Where this kiosk stands, from its token.
  useEffect(() => {
    if (token === null) {
      setScreen({ kind: 'not-set-up' });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      const answer = await api<DeviceResponse>('/v1/devices/me', {
        token,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!answer.ok) {
        if (answer.status === 401) forgetDeviceToken();
        setScreen(
          answer.status === 401 || answer.status === 403
            ? { kind: 'not-set-up' }
            : { kind: 'offline' },
        );
        return;
      }
      const d = answer.body;
      if (d.device.kind !== 'KIOSK' || d.checkpoint.id !== checkpointId) {
        setScreen({ kind: 'not-set-up' });
        return;
      }
      setMe(d);
      setScreen((s) => (s.kind === 'starting' || s.kind === 'offline' ? { kind: 'welcome' } : s));
    })();
    return () => {
      controller.abort();
    };
  }, [token, checkpointId, attempt]);

  useEffect(() => {
    if (screen.kind !== 'offline') return;
    const timer = window.setTimeout(() => {
      setAttempt((a) => a + 1);
    }, RETRY_SECONDS * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [screen]);

  // Today's demo flights, for sample boarding passes, at every welcome of a synthetic airport.
  useEffect(() => {
    if (me === null || token === null || !me.airport.synthetic || screen.kind !== 'welcome') return;
    const controller = new AbortController();
    void api<DemoFlightsResponse>(`/v1/checkpoints/${checkpointId}/demo-flights`, {
      token,
      signal: controller.signal,
    }).then((answer) => {
      if (answer.ok) setDemo(answer.body);
    });
    return () => {
      controller.abort();
    };
  }, [me, token, checkpointId, screen.kind]);

  const reset = useCallback(() => {
    setScreen({ kind: 'welcome' });
    setLocale(defaultLocale);
    setPrivacy(false);
    setCode('');
  }, [defaultLocale]);

  const submit = useCallback(
    /** Reads a pass: for a number of its own, or, with `party`, to join the number on screen. */
    async (text: string, party: ShownTicket | null) => {
      const bcbp = text.replace(/[\r\n]+$/, '');
      if (busy.current || token === null || me === null || bcbp.trim() === '') return;
      busy.current = true;
      setCode('');
      setScreen(
        party === null ? { kind: 'reading' } : { kind: 'party', ticket: party, status: 'reading' },
      );
      const key = randomKey();
      const pass = bcbp.slice(0, MAX_PASS_LENGTH);
      const send = () =>
        api<ScanResponse>(`/v1/checkpoints/${checkpointId}/scans`, {
          method: 'POST',
          token,
          body: party === null ? { bcbp: pass } : { bcbp: pass, party: party.ref },
          idempotencyKey: key,
        });
      let answer = await send();
      if (!answer.ok && answer.status === 0) {
        // Once more with the same key: the server gives the same answer if it got the first.
        await sleep(1000);
        answer = await send();
      }
      busy.current = false;
      setAnswers((n) => n + 1);
      if (party !== null && (answer.ok || (answer.status !== 401 && answer.status !== 403))) {
        let status: PartyStatus = 'error';
        let ticket = party;
        if (answer.ok) {
          const scan = answer.body;
          if (scan.ticket !== null) {
            ticket = { ...party, partySize: scan.ticket.partySize };
          }
          if (scan.outcome === 'ADDED') {
            const grown = ticket.partySize - party.partySize;
            status = grown === 0 ? 'infantCounted' : grown === 2 ? 'addedInfant' : 'added';
          } else if (scan.outcome === 'RETRIEVED') status = 'already';
          else if (scan.reason !== null) status = scan.reason;
          if (scan.reason === 'TOO_LATE') ticket = { ...ticket, canGrow: false };
        } else if (answer.status === 400) {
          status = 'UNREADABLE';
        }
        // Unless the party was left meanwhile (Done, or the time ran out).
        setScreen((s) =>
          s.kind === 'party' && s.ticket.ref === party.ref ? { kind: 'party', ticket, status } : s,
        );
        return;
      }
      if (!answer.ok) {
        if (answer.status === 401 || answer.status === 403) setScreen({ kind: 'not-set-up' });
        else if (answer.status === 400) setScreen({ kind: 'refused', reason: 'UNREADABLE' });
        else setScreen({ kind: 'error' });
        return;
      }
      const scan = answer.body;
      if (
        (scan.outcome === 'ISSUED' ||
          scan.outcome === 'RETRIEVED' ||
          scan.outcome === 'REACTIVATED') &&
        scan.ticket !== null &&
        scan.ref !== null
      ) {
        setScreen({
          kind: 'ticket',
          ticket: {
            heading:
              scan.outcome === 'ISSUED'
                ? 'kiosk.issued'
                : scan.outcome === 'RETRIEVED'
                  ? 'kiosk.retrieved'
                  : 'kiosk.reactivated',
            number: scan.ticket.number,
            ref: scan.ref,
            atMs: Date.now(),
            flightId: scan.ticket.flightId,
            partySize: scan.ticket.partySize,
            canGrow: scan.ticket.state === 'QUEUED' || scan.ticket.state === 'PREPARE',
          },
        });
        return;
      }
      setScreen({ kind: 'refused', reason: scan.reason ?? 'UNREADABLE' });
    },
    [token, me, checkpointId],
  );

  // A result goes back to the welcome screen by itself; a party's screen, when no pass comes.
  useEffect(() => {
    const seconds =
      screen.kind === 'ticket'
        ? TICKET_SECONDS
        : screen.kind === 'party'
          ? PARTY_SECONDS
          : screen.kind === 'refused' || screen.kind === 'error'
            ? REFUSAL_SECONDS
            : null;
    if (seconds === null) return;
    const timer = window.setTimeout(reset, seconds * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [screen, reset]);

  // A new number prints once: not again when its party has added its passes.
  const printed = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPrint || screen.kind !== 'ticket' || screen.ticket.heading !== 'kiosk.issued') return;
    if (printed.current === screen.ticket.ref) return;
    printed.current = screen.ticket.ref;
    window.print();
  }, [screen, autoPrint]);

  // The scanner types into the field: it keeps the focus, but never takes it from the dialog.
  useEffect(() => {
    if (!privacy) field.current?.focus({ preventScroll: true });
  }, [screen, privacy, locale]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const input = field.current;
      if (input === null || privacy || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.activeElement === input) return;
      // A pass never starts with a space: a space alone still presses the focused button.
      const printable = event.key.length === 1 && (event.key !== ' ' || input.value.length > 0);
      if (printable) input.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [privacy]);

  useEffect(() => {
    const d = dialog.current;
    if (d === null) return;
    if (privacy && !d.open) d.showModal();
    if (!privacy && d.open) d.close();
  }, [privacy]);

  const ready = me !== null && token !== null;
  const party = screen.kind === 'party' ? screen.ticket : null;
  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    void submit(code, party);
  };
  /** A sample pass (demo): a companion's is for the party's flight. */
  const sample = () => {
    if (me === null || demo === null) return;
    const text = samplePass(me.airport.iata, demo, Date.now(), party?.flightId);
    if (text !== null) void submit(text, party);
  };
  const sampleButton =
    me?.airport.synthetic === true && demo !== null && demo.flights.length > 0 ? (
      <KioskButton className="button secondary" id="kiosk-sample" onClick={sample}>
        {t(locale, 'kiosk.sample')}
      </KioskButton>
    ) : null;
  const partyText = (status: PartyStatus): string => {
    if (status === 'ready') return t(locale, 'kiosk.party.hint');
    if (status === 'reading') return t(locale, 'kiosk.reading');
    if (status === 'added') return t(locale, 'kiosk.party.added');
    if (status === 'addedInfant') return t(locale, 'kiosk.party.addedInfant');
    if (status === 'infantCounted') return t(locale, 'kiosk.party.infantCounted');
    if (status === 'already') return t(locale, 'kiosk.party.already');
    if (status === 'error') return t(locale, 'kiosk.error');
    return t(locale, `kiosk.reason.${status}`);
  };

  let content: ReactNode;
  switch (screen.kind) {
    case 'starting':
      content = <div className="spinner" role="progressbar" aria-label="GateFlow" />;
      break;
    case 'not-set-up':
      content = (
        <section className="card message-card" id="kiosk-not-set-up">
          <p className="message">{t(locale, 'kiosk.notSetUp')}</p>
        </section>
      );
      break;
    case 'offline':
      content = (
        <section className="card message-card" id="kiosk-offline">
          <p className="message">{t(locale, 'kiosk.error')}</p>
        </section>
      );
      break;
    case 'welcome':
      content = (
        <section className="card welcome" id="kiosk-welcome">
          <PassIllustration />
          <h1>{t(locale, 'kiosk.title')}</h1>
          <p className="lead">{t(locale, 'kiosk.hint')}</p>
          {sampleButton}
        </section>
      );
      break;
    case 'reading':
      content = (
        <section className="card message-card" aria-busy="true">
          <div className="spinner" aria-hidden="true" />
          <p className="message">{t(locale, 'kiosk.reading')}</p>
        </section>
      );
      break;
    case 'ticket': {
      const shown = screen.ticket;
      const url = `${window.location.origin}/t/${shown.ref}`;
      content = (
        <section className="card ticket" id="kiosk-ticket" data-party-size={shown.partySize}>
          <div className="ticket-text">
            <p className="eyebrow print-only">
              {me === null
                ? ''
                : t(locale, 'ticket.ticketFor', { checkpoint: me.checkpoint.label })}
            </p>
            <h1 className="eyebrow" id="ticket-heading">
              {t(locale, shown.heading)}
            </h1>
            <p
              className="number"
              id="ticket-number"
              data-length={shown.number.length}
              aria-describedby="ticket-heading"
            >
              {shown.number}
            </p>
            {shown.partySize > 1 ? (
              <p className="party-size" id="ticket-party">
                {t(locale, 'ticket.people', { count: shown.partySize })}
              </p>
            ) : null}
            <p className="wait">{t(locale, 'kiosk.wait')}</p>
            <p className="print-only issued-at">
              {me === null ? '' : dateAndTime(shown.atMs, locale, me.airport.timeZone)}
            </p>
          </div>
          <figure className="qr-block" data-ticket-url={url}>
            <QrCode text={url} label={t(locale, 'kiosk.qr')} />
            <figcaption>{t(locale, 'kiosk.qr')}</figcaption>
          </figure>
          <div className="actions">
            {shown.canGrow ? (
              <KioskButton
                className="button secondary"
                id="kiosk-add-pass"
                onClick={() => {
                  setScreen({ kind: 'party', ticket: shown, status: 'ready' });
                }}
              >
                {t(locale, 'kiosk.party.add')}
              </KioskButton>
            ) : null}
            <KioskButton
              className="button secondary"
              id="kiosk-print"
              onClick={() => {
                window.print();
              }}
            >
              {t(locale, 'kiosk.print')}
            </KioskButton>
            <KioskButton className="button primary" id="kiosk-done" onClick={reset}>
              {t(locale, 'kiosk.done')}
            </KioskButton>
          </div>
        </section>
      );
      break;
    }
    case 'party': {
      const shown = screen.ticket;
      const status = screen.status;
      content = (
        <section
          className="card party"
          id="kiosk-party"
          data-status={status}
          data-party-size={shown.partySize}
        >
          <h1>{t(locale, 'kiosk.party.title')}</h1>
          <p className="number" id="party-number" data-length={shown.number.length}>
            {shown.number}
          </p>
          <p className="party-count" id="kiosk-party-count">
            {t(locale, 'kiosk.party.count', { count: shown.partySize })}
          </p>
          <p
            className="party-status"
            id="kiosk-party-status"
            data-kind={
              status === 'added' || status === 'addedInfant' || status === 'infantCounted'
                ? 'ok'
                : status === 'ready' || status === 'reading' || status === 'already'
                  ? 'info'
                  : 'warn'
            }
          >
            {partyText(status)}
          </p>
          <div className="actions">
            {sampleButton}
            <KioskButton
              className="button primary"
              id="kiosk-party-done"
              onClick={() => {
                setScreen({ kind: 'ticket', ticket: shown });
              }}
            >
              {t(locale, 'kiosk.done')}
            </KioskButton>
          </div>
        </section>
      );
      break;
    }
    case 'refused':
    case 'error':
      content = (
        <section className="card message-card refused" id="kiosk-refused" role="alert">
          <svg className="notice-icon" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="21" />
            <path d="M24 13v14M24 33v2" />
          </svg>
          <p className="message" id="kiosk-reason">
            {screen.kind === 'refused'
              ? t(locale, `kiosk.reason.${screen.reason}`)
              : t(locale, 'kiosk.error')}
          </p>
          <KioskButton className="button primary" id="kiosk-again" onClick={reset}>
            {t(locale, 'kiosk.again')}
          </KioskButton>
        </section>
      );
      break;
  }

  return (
    <div className="kiosk" data-screen={screen.kind} data-answers={answers}>
      <header className="bar">
        <div className="place">
          <span className="brand">GateFlow</span>
          {me === null ? null : <span className="where">{me.checkpoint.label}</span>}
        </div>
        <LanguageSwitch locale={locale} onChange={setLocale} />
      </header>
      <main className="kiosk-main" aria-live="polite">
        {content}
      </main>
      {ready ? (
        <form className="scan-form" onSubmit={onSubmit}>
          <label htmlFor="kiosk-code">{t(locale, 'kiosk.paste.label')}</label>
          <div className="scan-row">
            <input
              id="kiosk-code"
              ref={field}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              maxLength={MAX_PASS_LENGTH}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button type="submit" className="button secondary" id="kiosk-read">
              {t(locale, 'kiosk.paste.submit')}
            </button>
          </div>
        </form>
      ) : null}
      <footer className="kiosk-foot">
        <p>{t(locale, 'kiosk.privacy.short')}</p>
        <div className="foot-actions">
          {me?.airport.synthetic === true ? (
            <span className="demo-badge">{t(locale, 'kiosk.demo')}</span>
          ) : null}
          <KioskButton
            className="link-button"
            id="kiosk-privacy"
            onClick={() => {
              setPrivacy(true);
            }}
          >
            {t(locale, 'kiosk.privacy.open')}
          </KioskButton>
        </div>
      </footer>
      <dialog
        ref={dialog}
        className="privacy"
        aria-labelledby="privacy-title"
        onClose={() => {
          setPrivacy(false);
        }}
      >
        <h2 id="privacy-title">{t(locale, 'kiosk.privacy.title')}</h2>
        <p>{t(locale, 'kiosk.privacy.body')}</p>
        <p className="draft">{t(locale, 'kiosk.privacy.draft')}</p>
        <form method="dialog">
          <button type="submit" className="button primary" id="privacy-close">
            {t(locale, 'kiosk.done')}
          </button>
        </form>
      </dialog>
    </div>
  );
}
