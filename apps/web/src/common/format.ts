import type { Locale } from '@gateflow/i18n';
import { useEffect } from 'react';

/** The regional conventions of each language: 24-hour times in Europe, Mexican Spanish. */
const INTL_LOCALE: Readonly<Record<Locale, string>> = { it: 'it-IT', en: 'en-GB', es: 'es-MX' };

/** A time of day as the reader writes it: `14:05`. */
export function timeOfDay(ms: number, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(ms));
}

/** A date and time for a printed ticket: `22 nov 2026, 14:05`. */
export function dateAndTime(ms: number, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(ms));
}

/** Keeps the document's language that of the screen, for screen readers and hyphenation. */
export function useDocumentLanguage(locale: Locale): void {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
