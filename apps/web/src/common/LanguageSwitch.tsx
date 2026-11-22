import { LANGUAGE_NAMES, LOCALES } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';

/** The languages of the screen, each written in itself. */
export function LanguageSwitch({
  locale,
  onChange,
}: {
  readonly locale: Locale;
  readonly onChange: (locale: Locale) => void;
}) {
  return (
    <div className="languages" role="group" aria-label="Language / Lingua / Idioma">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className="language"
          aria-pressed={l === locale}
          // A tap must not take the focus from the scanner's field on a kiosk.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            onChange(l);
          }}
        >
          {LANGUAGE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
