import { randomBytes } from 'node:crypto';
import type { Clock } from './time';

/** Identifiers of the server. Injected, so that tests can fix them. */
export interface Ids {
  /** A UUID version 7: time-ordered, which keeps indexes compact. */
  uuid(): string;
  /** 128 random bits for a ticket's page and QR code (base64url, 22 characters). */
  opaqueRef(): string;
}

/** A UUID version 7 for the instant `ms` (RFC 9562). */
export function uuidv7(ms: number, random: Uint8Array = randomBytes(16)): string {
  const bytes = Uint8Array.from(random);
  let t = Math.floor(ms);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomIds(clock: Clock): Ids {
  return {
    uuid: () => uuidv7(clock.now()),
    opaqueRef: () => randomBytes(16).toString('base64url'),
  };
}
