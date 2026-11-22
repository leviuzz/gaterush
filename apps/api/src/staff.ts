import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { staffSession, staffUser } from './db/schema';
import type { Ids } from './ids';
import { ApiError, loadCheckpoint } from './runtime';
import type { CheckpointRow } from './runtime';
import type { Clock } from './time';

/*
 * Staff sign in (S15): local users with a password, sessions in a cookie the page's scripts cannot
 * read. OIDC/SAML with MFA replace the passwords for the pilot (kickoff 2.9); the roles and their
 * scopes stay.
 *
 * - A password is kept as a scrypt hash; a session as the SHA-256 of its random token.
 * - The cookie is HttpOnly and SameSite=Strict, Secure over TLS; a request from another origin is
 *   refused, so another site cannot act with a staff member's session.
 * - Repeated failures for one login are slowed down (per server).
 */

/** The roles of the live checkpoints, each with what the previous one may do (kickoff 2.6). */
export const LIVE_ROLES = ['OPERATOR', 'SUPERVISOR', 'ADMIN'] as const;
export type LiveRole = (typeof LIVE_ROLES)[number];
/**
 * Every role of an airport's staff: the live ones, and the analysts (S19), who simulate and have
 * no right on a live checkpoint.
 */
export const STAFF_ROLES = [...LIVE_ROLES, 'ANALYST'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Whether a member may simulate (S19): analysts and administrators. */
export function simulates(member: StaffMember): boolean {
  return member.role === 'ANALYST' || member.role === 'ADMIN';
}

export interface StaffMember {
  readonly id: string;
  readonly airportId: string;
  readonly login: string;
  readonly role: StaffRole;
  /** The checkpoints the member works at; null for every checkpoint of the airport. */
  readonly checkpointIds: readonly string[] | null;
}

export const SESSION_COOKIE = 'gateflow_session';
/** A session lasts one shift. */
export const SESSION_MS = 12 * 60 * 60 * 1000;
const LOGIN = /^[a-z0-9][a-z0-9._-]{2,62}$/;

/**
 * scrypt with N = 2^15, r = 8, p = 3: one of the parameter sets the OWASP Password Storage Cheat
 * Sheet recommends (32 MiB of memory for each check of a password).
 */
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;

function scryptOf(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, 32, SCRYPT, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptOf(password, salt);
  return `scrypt$${String(SCRYPT.N)}$${String(SCRYPT.r)}$${String(SCRYPT.p)}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || salt === undefined || key === undefined) return false;
  if (n !== String(SCRYPT.N) || r !== String(SCRYPT.r) || p !== String(SCRYPT.p)) return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptOf(password, Buffer.from(salt, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A hash to check against when the login is unknown: the answer takes as long either way. */
const DECOY = hashPassword(randomBytes(16).toString('base64url'));

/** A password for a new member, shown once: 20 characters, 100 random bits. */
export function newPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet.charAt(b % alphabet.length)).join('');
}

function memberOf(row: typeof staffUser.$inferSelect): StaffMember {
  return {
    id: row.id,
    airportId: row.airportId,
    login: row.login,
    role: row.role as StaffRole,
    checkpointIds: row.checkpointIds,
  };
}

/** Adds a member of staff; the password is returned once. */
export async function addStaff(
  db: Db,
  ids: Ids,
  values: {
    readonly airportId: string;
    readonly login: string;
    readonly role: StaffRole;
    readonly checkpointIds: readonly string[] | null;
  },
): Promise<{ readonly member: StaffMember; readonly password: string }> {
  if (!LOGIN.test(values.login)) {
    throw new Error('a login is 3 to 63 lower-case letters, digits, dots, dashes or underscores');
  }
  if (!STAFF_ROLES.includes(values.role)) throw new Error(`unknown role ${values.role}`);
  const password = newPassword();
  const id = ids.uuid();
  await db.insert(staffUser).values({
    id,
    airportId: values.airportId,
    login: values.login,
    role: values.role,
    checkpointIds: values.checkpointIds === null ? null : [...values.checkpointIds],
    passwordHash: await hashPassword(password),
  });
  return { member: { id, ...values }, password };
}

/** A new password for a member, returned once; their sessions end. */
export async function resetPassword(db: Db, login: string): Promise<string | null> {
  const password = newPassword();
  const rows = await db
    .update(staffUser)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(staffUser.login, login))
    .returning({ id: staffUser.id });
  const id = rows[0]?.id;
  if (id === undefined) return null;
  await db
    .update(staffSession)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSession.userId, id), isNull(staffSession.revokedAt)));
  return password;
}

/** Disables a member: they cannot sign in, and their sessions end at once. */
export async function disableStaff(db: Db, login: string): Promise<boolean> {
  const rows = await db
    .update(staffUser)
    .set({ disabledAt: new Date() })
    .where(and(eq(staffUser.login, login), isNull(staffUser.disabledAt)))
    .returning({ id: staffUser.id });
  const id = rows[0]?.id;
  if (id === undefined) return false;
  await db
    .update(staffSession)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSession.userId, id), isNull(staffSession.revokedAt)));
  return true;
}

/** Failed sign-ins per login, kept by this server: after 10 in 15 minutes, wait. */
export class SignInGuard {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly limit = 10,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  blocked(login: string): boolean {
    return this.recent(login).length >= this.limit;
  }

  failed(login: string): void {
    this.failures.set(login, [...this.recent(login), this.clock.now()]);
  }

  succeeded(login: string): void {
    this.failures.delete(login);
  }

  private recent(login: string): number[] {
    const since = this.clock.now() - this.windowMs;
    return (this.failures.get(login) ?? []).filter((at) => at > since);
  }
}

/** Checks a login and password; on success, opens a session and returns its token, once. */
export async function signIn(
  db: Db,
  clock: Clock,
  login: string,
  password: string,
): Promise<{ readonly member: StaffMember; readonly token: string } | null> {
  const rows = await db
    .select()
    .from(staffUser)
    .where(and(eq(staffUser.login, login), isNull(staffUser.disabledAt)));
  const row = rows[0];
  const ok = await passwordMatches(password, row?.passwordHash ?? (await DECOY));
  if (row === undefined || !ok) return null;
  const token = randomBytes(32).toString('base64url');
  await db.insert(staffSession).values({
    tokenHash: sha256(token),
    userId: row.id,
    expiresAtMs: clock.now() + SESSION_MS,
  });
  return { member: memberOf(row), token };
}

/** Ends the session of a request, if any. */
export async function signOut(db: Db, request: FastifyRequest): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token === undefined || token === '') return;
  await db
    .update(staffSession)
    .set({ revokedAt: new Date() })
    .where(eq(staffSession.tokenHash, sha256(token)));
}

/** The member of staff signed in on a request, or null. */
export async function staffOf(
  db: Db,
  clock: Clock,
  request: FastifyRequest,
): Promise<StaffMember | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (token === undefined || token === '') return null;
  const rows = await db
    .select({ user: staffUser })
    .from(staffSession)
    .innerJoin(staffUser, eq(staffUser.id, staffSession.userId))
    .where(
      and(
        eq(staffSession.tokenHash, sha256(token)),
        isNull(staffSession.revokedAt),
        gt(staffSession.expiresAtMs, clock.now()),
        isNull(staffUser.disabledAt),
      ),
    );
  const row = rows[0];
  return row === undefined ? null : memberOf(row.user);
}

/**
 * Refuses a request sent by a page of another site (403): with SameSite=Strict cookies and JSON
 * bodies, the third guard against acting with a staff member's session from elsewhere.
 */
export function requireSameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  // The Host header against the origin's host, with the origin's scheme: a default port (80 for
  // http, 443 for https) may be written or not.
  const sameHost = (): boolean => {
    try {
      const from = new URL(origin);
      return from.host === new URL(`${from.protocol}//${request.headers.host ?? ''}`).host;
    } catch {
      return false;
    }
  };
  if (!sameHost()) {
    throw new ApiError(403, 'CROSS_ORIGIN', 'staff requests come from this site only');
  }
}

/**
 * The member of staff a request needs: from this site, signed in (else 401), for a checkpoint
 * that exists (else 404), with at least `role` and working at the checkpoint (else 403).
 */
export async function requireStaff(
  db: Db,
  clock: Clock,
  request: FastifyRequest,
  role: LiveRole,
  checkpointId: string,
): Promise<{ readonly member: StaffMember; readonly checkpoint: CheckpointRow }> {
  requireSameOrigin(request);
  const member = await staffOf(db, clock, request);
  if (member === null) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in as staff first');
  const checkpoint = await loadCheckpoint(db, checkpointId);
  const allowed =
    // An analyst has no live role: indexOf gives -1.
    (LIVE_ROLES as readonly string[]).indexOf(member.role) >= LIVE_ROLES.indexOf(role) &&
    member.airportId === checkpoint.airportId &&
    (member.checkpointIds === null || member.checkpointIds.includes(checkpoint.id));
  if (!allowed) {
    throw new ApiError(403, 'NOT_ALLOWED', `this needs a ${role.toLowerCase()} of this checkpoint`);
  }
  return { member, checkpoint };
}

/** Sets the session cookie: HttpOnly, SameSite=Strict, Secure when the request came over TLS. */
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
