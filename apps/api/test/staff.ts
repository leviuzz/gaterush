import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../src/db/client';
import { randomIds } from '../src/ids';
import { addStaff } from '../src/staff';
import type { StaffRole } from '../src/staff';
import type { Clock } from '../src/time';

/**
 * Adds a member of an airport's staff and signs them in through the API: the `cookie` header of
 * their session, for the staff's requests of a test.
 */
export async function staffCookie(
  app: FastifyInstance,
  db: Db,
  clock: Clock,
  airportId: string,
  role: StaffRole = 'SUPERVISOR',
  checkpointIds: string[] | null = null,
): Promise<string> {
  const login = `${role.toLowerCase()}-${randomBytes(4).toString('hex')}`;
  const { password } = await addStaff(db, randomIds(clock), {
    airportId,
    login,
    role,
    checkpointIds,
  });
  const signed = await app.inject({
    method: 'POST',
    url: '/v1/auth/sign-in',
    payload: { login, password },
  });
  if (signed.statusCode !== 200) throw new Error(`cannot sign in: ${signed.body}`);
  const cookie = signed.cookies.find((c) => c.name === 'gateflow_session');
  if (cookie === undefined) throw new Error('no session cookie');
  return `gateflow_session=${cookie.value}`;
}
