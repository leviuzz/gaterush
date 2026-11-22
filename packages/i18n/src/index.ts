/*
 * Every text of GateFlow's screens for passengers, in the languages of the first airports:
 * Italian, English and Spanish as spoken in Mexico (kickoff 2.13). Plain words, no jargon, and
 * nothing that promises priority: a passenger is told what to do, never why others go first.
 */

export const LOCALES = ['it', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** The name of each language, written in that language. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
};

const EN = {
  'kiosk.title': 'Scan your boarding pass',
  'kiosk.hint': 'Hold the barcode under the reader: on paper or on your phone.',
  'kiosk.privacy.short':
    'We read your boarding pass only to give you a number. We never keep your name or your booking reference.',
  'kiosk.privacy.open': 'Privacy',
  'kiosk.privacy.title': 'How we use your boarding pass',
  'kiosk.privacy.body':
    'The kiosk reads your boarding pass to find your flight and give you a number in the queue. Your name, booking reference and seat are read and forgotten at once: they are never stored. We keep your number, your flight and when you were called, to run the queue and to measure waiting times. The airport is responsible for this processing.',
  'kiosk.privacy.draft': 'Draft notice, to be completed with the airport.',
  'kiosk.paste.label': 'Or type or paste the code of a boarding pass',
  'kiosk.paste.submit': 'Read',
  'kiosk.sample': 'Use a sample boarding pass (demo)',
  'kiosk.reading': 'Reading…',
  'kiosk.issued': 'Your number',
  'kiosk.retrieved': 'You already have a number',
  'kiosk.wait':
    'You can wait anywhere. Watch the screens: when your number appears, go to the security entrance.',
  'kiosk.qr': 'Scan to follow your number on your phone',
  'kiosk.print': 'Print',
  'kiosk.done': 'Done',
  'kiosk.again': 'Scan another boarding pass',
  'kiosk.reason.UNREADABLE':
    'We could not read this boarding pass. Try again, or ask a member of staff.',
  'kiosk.reason.WRONG_AIRPORT':
    'This boarding pass is not for a flight from this airport. Please ask a member of staff.',
  'kiosk.reason.WRONG_DAY':
    'This boarding pass is not for a flight today. Please ask a member of staff.',
  'kiosk.reason.UNKNOWN_FLIGHT': 'We could not find your flight. Please ask a member of staff.',
  'kiosk.reason.ALREADY_ADMITTED':
    'This boarding pass has already gone through security. Please ask a member of staff.',
  'kiosk.notSetUp': 'This kiosk is not set up yet. Please ask a member of staff.',
  'kiosk.error': 'Something went wrong. Please ask a member of staff.',
  'kiosk.demo': 'Demo with synthetic data',
  'ticket.title': 'Your number',
  'ticket.state.QUEUED': 'You are in the queue. You can wait anywhere.',
  'ticket.state.PREPARE': 'Get ready: you will be called soon.',
  'ticket.state.CALLED': 'It is your turn: go to the security entrance now.',
  'ticket.state.RECALLED': 'Second call: go to the security entrance now.',
  'ticket.state.NO_SHOW':
    'You missed your call. Go to the security entrance now, or scan your boarding pass again at a kiosk.',
  'ticket.state.ADMITTED': 'You are through security. Have a good flight.',
  'ticket.state.EXPIRED': 'This number has expired. Scan your boarding pass again at a kiosk.',
  'ticket.notFound': 'This ticket does not exist.',
  'ticket.updated': 'Updated at {time}',
  'ticket.ticketFor': 'Ticket for {checkpoint}',
} as const;

export type MessageKey = keyof typeof EN;

const IT: Readonly<Record<MessageKey, string>> = {
  'kiosk.title': "Scansiona la carta d'imbarco",
  'kiosk.hint': 'Avvicina il codice al lettore: su carta o sul telefono.',
  'kiosk.privacy.short':
    "Leggiamo la carta d'imbarco solo per darti un numero. Non conserviamo mai il tuo nome né il codice di prenotazione.",
  'kiosk.privacy.open': 'Privacy',
  'kiosk.privacy.title': "Come usiamo la tua carta d'imbarco",
  'kiosk.privacy.body':
    "Il totem legge la carta d'imbarco per trovare il tuo volo e darti un numero nella coda. Nome, codice di prenotazione e posto vengono letti e dimenticati subito: non sono mai salvati. Conserviamo il tuo numero, il volo e quando sei stato chiamato, per gestire la coda e misurare le attese. Il titolare del trattamento è il gestore dell'aeroporto.",
  'kiosk.privacy.draft': "Bozza di informativa, da completare con l'aeroporto.",
  'kiosk.paste.label': "Oppure scrivi o incolla il codice di una carta d'imbarco",
  'kiosk.paste.submit': 'Leggi',
  'kiosk.sample': "Usa una carta d'imbarco di esempio (demo)",
  'kiosk.reading': 'Lettura in corso…',
  'kiosk.issued': 'Il tuo numero',
  'kiosk.retrieved': 'Hai già un numero',
  'kiosk.wait':
    "Puoi aspettare dove vuoi. Guarda gli schermi: quando compare il tuo numero, vai all'ingresso dei controlli.",
  'kiosk.qr': 'Inquadra per seguire il tuo numero sul telefono',
  'kiosk.print': 'Stampa',
  'kiosk.done': 'Fatto',
  'kiosk.again': "Scansiona un'altra carta d'imbarco",
  'kiosk.reason.UNREADABLE':
    "Non riusciamo a leggere questa carta d'imbarco. Riprova, oppure chiedi al personale.",
  'kiosk.reason.WRONG_AIRPORT':
    "Questa carta d'imbarco non è per un volo in partenza da questo aeroporto. Chiedi al personale.",
  'kiosk.reason.WRONG_DAY':
    "Questa carta d'imbarco non è per un volo di oggi. Chiedi al personale.",
  'kiosk.reason.UNKNOWN_FLIGHT': 'Non troviamo il tuo volo. Chiedi al personale.',
  'kiosk.reason.ALREADY_ADMITTED':
    "Questa carta d'imbarco ha già passato i controlli. Chiedi al personale.",
  'kiosk.notSetUp': 'Questo totem non è ancora configurato. Chiedi al personale.',
  'kiosk.error': 'Qualcosa non ha funzionato. Chiedi al personale.',
  'kiosk.demo': 'Demo con dati sintetici',
  'ticket.title': 'Il tuo numero',
  'ticket.state.QUEUED': 'Sei in coda. Puoi aspettare dove vuoi.',
  'ticket.state.PREPARE': 'Preparati: sarai chiamato a breve.',
  'ticket.state.CALLED': "Tocca a te: vai subito all'ingresso dei controlli.",
  'ticket.state.RECALLED': "Seconda chiamata: vai subito all'ingresso dei controlli.",
  'ticket.state.NO_SHOW':
    "Non ti sei presentato alla chiamata. Vai subito all'ingresso dei controlli, oppure scansiona di nuovo la carta d'imbarco a un totem.",
  'ticket.state.ADMITTED': 'Hai passato i controlli. Buon viaggio.',
  'ticket.state.EXPIRED':
    "Questo numero è scaduto. Scansiona di nuovo la carta d'imbarco a un totem.",
  'ticket.notFound': 'Questo ticket non esiste.',
  'ticket.updated': 'Aggiornato alle {time}',
  'ticket.ticketFor': 'Ticket per {checkpoint}',
};

const ES: Readonly<Record<MessageKey, string>> = {
  'kiosk.title': 'Escanee su pase de abordar',
  'kiosk.hint': 'Acerque el código al lector: en papel o en su teléfono.',
  'kiosk.privacy.short':
    'Leemos su pase de abordar solo para darle un número. Nunca guardamos su nombre ni su clave de reservación.',
  'kiosk.privacy.open': 'Privacidad',
  'kiosk.privacy.title': 'Cómo usamos su pase de abordar',
  'kiosk.privacy.body':
    'El quiosco lee su pase de abordar para encontrar su vuelo y darle un número en la fila. Su nombre, clave de reservación y asiento se leen y se olvidan de inmediato: nunca se guardan. Conservamos su número, su vuelo y cuándo fue llamado, para operar la fila y medir los tiempos de espera. El responsable de este tratamiento es el operador del aeropuerto.',
  'kiosk.privacy.draft': 'Aviso de privacidad en borrador, por completar con el aeropuerto.',
  'kiosk.paste.label': 'O escriba o pegue el código de un pase de abordar',
  'kiosk.paste.submit': 'Leer',
  'kiosk.sample': 'Usar un pase de abordar de ejemplo (demo)',
  'kiosk.reading': 'Leyendo…',
  'kiosk.issued': 'Su número',
  'kiosk.retrieved': 'Ya tiene un número',
  'kiosk.wait':
    'Puede esperar donde quiera. Mire las pantallas: cuando aparezca su número, vaya a la entrada del control de seguridad.',
  'kiosk.qr': 'Escanee para seguir su número en su teléfono',
  'kiosk.print': 'Imprimir',
  'kiosk.done': 'Listo',
  'kiosk.again': 'Escanear otro pase de abordar',
  'kiosk.reason.UNREADABLE':
    'No pudimos leer este pase de abordar. Inténtelo de nuevo o pida ayuda al personal.',
  'kiosk.reason.WRONG_AIRPORT':
    'Este pase de abordar no es para un vuelo que salga de este aeropuerto. Pida ayuda al personal.',
  'kiosk.reason.WRONG_DAY':
    'Este pase de abordar no es para un vuelo de hoy. Pida ayuda al personal.',
  'kiosk.reason.UNKNOWN_FLIGHT': 'No encontramos su vuelo. Pida ayuda al personal.',
  'kiosk.reason.ALREADY_ADMITTED':
    'Este pase de abordar ya pasó el control de seguridad. Pida ayuda al personal.',
  'kiosk.notSetUp': 'Este quiosco todavía no está configurado. Pida ayuda al personal.',
  'kiosk.error': 'Algo salió mal. Pida ayuda al personal.',
  'kiosk.demo': 'Demo con datos sintéticos',
  'ticket.title': 'Su número',
  'ticket.state.QUEUED': 'Está en la fila. Puede esperar donde quiera.',
  'ticket.state.PREPARE': 'Prepárese: pronto lo llamaremos.',
  'ticket.state.CALLED': 'Es su turno: vaya ahora a la entrada del control de seguridad.',
  'ticket.state.RECALLED': 'Segundo llamado: vaya ahora a la entrada del control de seguridad.',
  'ticket.state.NO_SHOW':
    'No se presentó a su llamado. Vaya ahora a la entrada del control de seguridad o escanee de nuevo su pase de abordar en un quiosco.',
  'ticket.state.ADMITTED': 'Ya pasó el control de seguridad. Buen viaje.',
  'ticket.state.EXPIRED':
    'Este número ha vencido. Escanee de nuevo su pase de abordar en un quiosco.',
  'ticket.notFound': 'Este boleto no existe.',
  'ticket.updated': 'Actualizado a las {time}',
  'ticket.ticketFor': 'Boleto para {checkpoint}',
};

export const MESSAGES: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en: EN,
  it: IT,
  es: ES,
};

/** A text in a language, with its `{placeholders}` filled in. */
export function t(
  locale: Locale,
  key: MessageKey,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** The first of the reader's languages GateFlow speaks, else `fallback`. */
export function localeFor(languages: readonly string[], fallback: Locale = 'en'): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    const found = LOCALES.find((l) => l === base);
    if (found !== undefined) return found;
  }
  return fallback;
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
