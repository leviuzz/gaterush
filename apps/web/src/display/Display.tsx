import { t } from '@gateflow/i18n';
import type { Locale, MessageKey } from '@gateflow/i18n';
import type { DeviceResponse, DisplayBoard, DisplayMessage } from '@gateflow/contracts';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { follow } from '../common/stream';
import { deviceToken, forgetDeviceToken } from '../device';

/*
 * A checkpoint's display (S16, ADR-047): the numbers called and the numbers to get ready, as
 * the server sends them over server-sent events, in the display's language and in English.
 * Numbers only: nothing personal, no position, no waiting time. Without news from the server for
 * 30 seconds it says it is not up to date; after 2 minutes it asks passengers to follow the staff,
 * as the checkpoint then goes back to its usual queue. When the supervisor pauses the calls it
 * says so above the numbers; in an emergency it shows only the emergency message (S17).
 */

/** Without a message or a heartbeat for this long, the display says it is not up to date. */
export const STALE_MS = 30_000;
/** Without one for this long, the display shows the staff's instructions instead of numbers. */
export const DOWN_MS = 120_000;
/** A number just called flashes for this long. */
const FRESH_MS = 10_000;
/** The most numbers shown in each column. */
const CALLED_SHOWN = 8;
const PREPARE_SHOWN = 12;
const RETRY_MS = 5000;

type Phase = 'starting' | 'not-set-up' | 'offline' | 'ready';

/** A text in the display's language and, below it, in English. */
function Both({ locale, k }: { readonly locale: Locale; readonly k: MessageKey }) {
  return (
    <>
      <span lang={locale}>{t(locale, k)}</span>
      {locale === 'en' ? null : (
        <span className="in-english" lang="en">
          {t('en', k)}
        </span>
      )}
    </>
  );
}

export function Display({
  checkpointId,
  locale,
}: {
  readonly checkpointId: string;
  readonly locale: Locale;
}) {
  const [token] = useState(() => deviceToken('display'));
  const [phase, setPhase] = useState<Phase>(token === null ? 'not-set-up' : 'starting');
  const [me, setMe] = useState<DeviceResponse | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState<DisplayBoard | null>(null);
  /** When the server was last heard from, by this display's clock. */
  const [heardAt, setHeardAt] = useState(() => Date.now());
  /** Numbers just called, and until when they flash. */
  const [fresh, setFresh] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  useDocumentLanguage(locale);
  useEffect(() => {
    // Light numbers on a dark screen, as in an airport's hall.
    document.documentElement.dataset.theme = 'dark';
  }, []);

  // Which display this is.
  useEffect(() => {
    if (token === null) return;
    const controller = new AbortController();
    void api<DeviceResponse>('/v1/devices/me', { token, signal: controller.signal }).then(
      (answer) => {
        if (controller.signal.aborted) return;
        if (!answer.ok) {
          if (answer.status === 401) forgetDeviceToken('display');
          setPhase(answer.status === 401 || answer.status === 403 ? 'not-set-up' : 'offline');
          return;
        }
        const d = answer.body;
        if (d.device.kind !== 'DISPLAY' || d.checkpoint.id !== checkpointId) {
          setPhase('not-set-up');
          return;
        }
        setMe(d);
        setHeardAt(Date.now());
        setPhase('ready');
      },
    );
    return () => {
      controller.abort();
    };
  }, [token, checkpointId, attempt]);

  // The server could not be reached at start: try again by itself.
  useEffect(() => {
    if (phase !== 'offline') return;
    const timer = window.setTimeout(() => {
      setAttempt((a) => a + 1);
    }, RETRY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  // The stream: every message or heartbeat is news; a board replaces the one shown.
  useEffect(() => {
    if (me === null || token === null) return;
    return follow(`/v1/checkpoints/${checkpointId}/display`, {
      token,
      onMessage: (message) => {
        const at = Date.now();
        setHeardAt(at);
        if (message.event !== 'board') return;
        const body = JSON.parse(message.data) as DisplayMessage;
        setBoard(body.board);
        if (body.calls.length > 0) {
          setFresh((before) => {
            const next = new Map(before);
            for (const call of body.calls) next.set(call.number, at + FRESH_MS);
            return next;
          });
        }
      },
      onRefused: () => {
        forgetDeviceToken('display');
        setPhase('not-set-up');
      },
    });
  }, [me, token, checkpointId]);

  // The clock of the screen: the time shown, the freshness, the end of the flashes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const silence = now - heardAt;
  const state =
    phase !== 'ready'
      ? phase
      : silence >= DOWN_MS
        ? 'down'
        : silence >= STALE_MS
          ? 'stale'
          : 'live';
  const timeZone = me?.airport.timeZone;
  const called = board?.called.slice(0, CALLED_SHOWN) ?? [];
  const prepare = board?.prepare.slice(0, PREPARE_SHOWN) ?? [];

  let content;
  if (phase === 'not-set-up') {
    content = (
      <main className="display-message" id="display-not-set-up">
        <p>
          <Both locale={locale} k="display.notSetUp" />
        </p>
      </main>
    );
  } else if (state === 'down' || phase === 'offline') {
    content = (
      <main className="display-message" id="display-down" role="alert">
        <p>
          <Both locale={locale} k="display.down" />
        </p>
      </main>
    );
  } else if (board === null) {
    content = (
      <main className="display-message">
        <div className="spinner" role="progressbar" aria-label="GateFlow" />
      </main>
    );
  } else if (board.mode === 'EMERGENCY') {
    content = (
      <main className="display-message display-emergency" id="display-emergency" role="alert">
        <p>
          <Both locale={locale} k="display.emergency" />
        </p>
      </main>
    );
  } else {
    content = (
      <main className={board.mode === 'PAUSED' ? 'display-main paused' : 'display-main'}>
        {board.mode === 'PAUSED' ? (
          <p className="display-paused" id="display-paused" role="status">
            <Both locale={locale} k="display.paused" />
          </p>
        ) : null}
        <section className="display-column display-called" aria-labelledby="display-called-title">
          <h1 id="display-called-title">
            <Both locale={locale} k="display.called" />
          </h1>
          <p className="display-hint">
            <Both locale={locale} k="display.go" />
          </p>
          {called.length === 0 ? (
            <p className="display-empty">
              <Both locale={locale} k="display.none" />
            </p>
          ) : (
            <ol className="display-numbers" id="display-called">
              {called.map((call) => (
                <li
                  key={call.number}
                  data-ticket={call.number}
                  data-second={call.second}
                  className={(fresh.get(call.number) ?? 0) > now ? 'fresh' : undefined}
                >
                  <span className="display-number">{call.number}</span>
                  {call.second ? (
                    <span className="display-second">
                      <Both locale={locale} k="display.secondCall" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="display-column display-prepare" aria-labelledby="display-prepare-title">
          <h2 id="display-prepare-title">
            <Both locale={locale} k="display.prepare" />
          </h2>
          <p className="display-hint">
            <Both locale={locale} k="display.prepareHint" />
          </p>
          {prepare.length === 0 ? (
            <p className="display-empty">
              <Both locale={locale} k="display.nonePrepare" />
            </p>
          ) : (
            <ol className="display-numbers" id="display-prepare">
              {prepare.map((number) => (
                <li key={number} data-ticket={number}>
                  <span className="display-number">{number}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="display" data-state={state} data-mode={board?.mode ?? 'NORMAL'}>
      <header className="display-bar">
        <div className="place">
          <span className="brand">GateFlow</span>
          {me === null ? null : <span className="where">{me.checkpoint.label}</span>}
        </div>
        <time className="display-clock">{timeOfDay(now, locale, timeZone)}</time>
      </header>
      {content}
      <footer className="display-foot">
        {phase === 'ready' ? (
          <span className="display-updated" id="display-updated">
            {t(locale, 'ticket.updated', { time: timeOfDay(heardAt, locale, timeZone) })}
          </span>
        ) : (
          <span />
        )}
        {state === 'stale' ? (
          <span className="display-stale" id="display-stale" role="status">
            <Both locale={locale} k="display.stale" />
          </span>
        ) : null}
        {me?.airport.synthetic === true ? (
          <span className="demo-badge">{t(locale, 'kiosk.demo')}</span>
        ) : null}
      </footer>
    </div>
  );
}
