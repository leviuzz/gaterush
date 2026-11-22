import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { device } from './db/schema';
import type { Ids } from './ids';
import { ApiError } from './runtime';

export type DeviceKind = 'KIOSK' | 'DISPLAY' | 'LANE';

export interface Device {
  readonly id: string;
  readonly checkpointId: string;
  readonly kind: DeviceKind;
  readonly name: string;
}

/**
 * Adds a device to a checkpoint. The token is returned once and never stored: only its SHA-256 is
 * kept, so a copy of the database cannot be used to impersonate a kiosk.
 */
export async function addDevice(
  db: Db,
  ids: Ids,
  values: { readonly checkpointId: string; readonly kind: DeviceKind; readonly name: string },
): Promise<{ readonly device: Device; readonly token: string }> {
  const token = randomBytes(32).toString('base64url');
  const id = ids.uuid();
  await db.insert(device).values({ id, ...values, tokenHash: sha256(token) });
  return { device: { id, ...values }, token };
}

/** Revokes a device: its token stops working at once. */
export async function revokeDevice(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(device)
    .set({ revokedAt: new Date() })
    .where(and(eq(device.id, id), isNull(device.revokedAt)))
    .returning({ id: device.id });
  return rows.length > 0;
}

/** The device that sent a request (`Authorization: Bearer <token>`), or a 401. */
export async function deviceOf(db: Db, request: FastifyRequest): Promise<Device> {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length).trim() : '';
  if (token === '') throw new ApiError(401, 'DEVICE_REQUIRED', 'this request needs a device token');
  const rows = await db
    .select()
    .from(device)
    .where(and(eq(device.tokenHash, sha256(token)), isNull(device.revokedAt)));
  const row = rows[0];
  if (row === undefined) throw new ApiError(401, 'UNKNOWN_DEVICE', 'the device token is not valid');
  return {
    id: row.id,
    checkpointId: row.checkpointId,
    kind: row.kind as DeviceKind,
    name: row.name,
  };
}

/** The device of a request, which must be of `kind` and belong to the checkpoint. */
export async function requireDevice(
  db: Db,
  request: FastifyRequest,
  checkpointId: string,
  kind: DeviceKind,
): Promise<Device> {
  const d = await deviceOf(db, request);
  if (d.checkpointId !== checkpointId || d.kind !== kind) {
    throw new ApiError(
      403,
      'WRONG_DEVICE',
      `this needs a ${kind.toLowerCase()} of this checkpoint`,
    );
  }
  return d;
}
