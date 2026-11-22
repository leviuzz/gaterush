import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGES, isLocale, localeFor, t } from '../src';
import type { MessageKey } from '../src';

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort((a, b) => (a < b ? -1 : 1));

describe('the catalogue', () => {
  const keys = Object.keys(MESSAGES.en) as MessageKey[];

  it.each(LOCALES)('%s has every text, none empty, with the same placeholders', (locale) => {
    expect(Object.keys(MESSAGES[locale]).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      const text = MESSAGES[locale][key];
      expect(text.trim().length, key).toBeGreaterThan(0);
      expect(placeholders(text), key).toEqual(placeholders(MESSAGES.en[key]));
    }
  });

  it('translates every text: no language copies another', () => {
    const same = keys.filter(
      (k) => MESSAGES.it[k] === MESSAGES.en[k] && MESSAGES.en[k].split(' ').length > 2,
    );
    expect(same).toEqual([]);
  });

  it('fills placeholders and picks the reader’s language', () => {
    expect(t('it', 'ticket.updated', { time: '10:42' })).toBe('Aggiornato alle 10:42');
    expect(t('es', 'ticket.ticketFor', { checkpoint: 'Filtro A' })).toBe('Boleto para Filtro A');
    expect(localeFor(['es-MX', 'en'])).toBe('es');
    expect(localeFor(['de-DE', 'it-IT'])).toBe('it');
    expect(localeFor(['fr'])).toBe('en');
    expect(isLocale('it')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('never promises priority to a passenger', () => {
    for (const locale of LOCALES) {
      for (const text of Object.values(MESSAGES[locale])) {
        expect(text).not.toMatch(/priorit|precedenza|prioridad|skip|salta/i);
      }
    }
  });
});
