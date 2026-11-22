import { createHash } from 'node:crypto';
import { canonicalJson } from '@gateflow/sim-scenarios';

/** The hash before the first command of a checkpoint. */
export const GENESIS_HASH = '0'.repeat(64);

/** An event of a command as it enters the chain. */
export interface ChainEvent {
  readonly seq: number;
  readonly type: string;
  readonly atMs: number;
  readonly ticketId: string | null;
  readonly payload: unknown;
}

/** Everything the chain covers of one command: the command, what it did and every event. */
export interface ChainEntry {
  readonly checkpointId: string;
  readonly seq: number;
  readonly serviceDay: string;
  readonly type: string;
  readonly atMs: number;
  readonly command: unknown;
  readonly result: unknown;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly actor: string;
  readonly events: readonly ChainEvent[];
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The hash of a command, chained to the previous one: changing any past row breaks the chain. */
export function chainHash(previous: string, entry: ChainEntry): string {
  return sha256(`${previous}\n${canonicalJson(entry)}`);
}

/** The fingerprint of a request, so that an idempotency key reused for another request is refused. */
export function requestHash(route: string, body: unknown): string {
  return sha256(`${route}\n${canonicalJson(body ?? null)}`);
}
