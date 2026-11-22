/**
 * What staff present at the access point, from what the scanner or the keyboard gave (S15): the
 * address of a ticket's page (its QR code), a boarding pass, or a ticket's number.
 */
export type Presented =
  { readonly ref: string } | { readonly bcbp: string } | { readonly number: string } | null;

const REF = /\/t\/([A-Za-z0-9_-]{16,64})$/;
const NUMBER = /^[A-Z]{1,3}\d{3,5}$/;

export function presented(text: string): Presented {
  // A scanner ends with a line end; a boarding pass keeps its inner spaces.
  const raw = text.replace(/[\r\n]+$/, '');
  const trimmed = raw.trim();
  const ref = REF.exec(trimmed)?.[1];
  if (ref !== undefined) return { ref };
  if (/^M[1-4]/.test(raw) && raw.length >= 58) return { bcbp: raw };
  const number = trimmed.replace(/\s+/g, '').toUpperCase();
  return NUMBER.test(number) ? { number } : null;
}
