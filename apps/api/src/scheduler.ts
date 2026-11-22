import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { checkpoint, checkpointTimer } from './db/schema';
import type { Runtime } from './runtime';
import type { Clock } from './time';

/**
 * Applies each checkpoint's timeouts when they are due (S15): a second call, a no-show, the expiry
 * of a no-show. Without it a called passenger who never comes would stay called until the next
 * command. Every pass looks for the checkpoints whose next timeout is due (`checkpoint_timer`,
 * written with every command) and sends them ADVANCE, under the checkpoint's lock like any
 * command.
 *
 * Several servers may run it at once: the idempotency key names the timeout it applies, so the
 * second server's command is a replay of the first's and applies nothing.
 */
export class TimerScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Db,
    private readonly runtime: Runtime,
    private readonly clock: Clock,
    private readonly intervalMs = 1000,
  ) {}

  /** Starts the passes, one every `intervalMs`. */
  start(onError: (error: unknown) => void): void {
    this.timer = setInterval(() => {
      this.tick().catch(onError);
    }, this.intervalMs);
    this.timer.unref();
  }

  /** Stops the passes and waits for the one running, if any. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running?.catch(() => undefined);
  }

  /**
   * One pass: ADVANCE for every checkpoint whose next timeout is due. Returns how many
   * checkpoints were advanced. A pass never overlaps another.
   */
  async tick(): Promise<number> {
    if (this.running !== null) return 0;
    this.running = this.pass();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  /**
   * Applies a checkpoint's timeouts due by now, before an answer that reads the state of a ticket
   * without changing it (a rescan at a kiosk): the answer is then never a second late.
   */
  async advanceIfDue(checkpointId: string): Promise<void> {
    await this.advanceDue(eq(checkpointTimer.checkpointId, checkpointId));
  }

  private async pass(): Promise<number> {
    return this.advanceDue();
  }

  private async advanceDue(only?: SQL): Promise<number> {
    const now = this.clock.now();
    const due = await this.db
      .select({
        checkpointId: checkpointTimer.checkpointId,
        serviceDay: checkpointTimer.serviceDay,
        nextDueMs: checkpointTimer.nextDueMs,
      })
      .from(checkpointTimer)
      .innerJoin(checkpoint, eq(checkpoint.id, checkpointTimer.checkpointId))
      .where(
        and(
          isNotNull(checkpointTimer.nextDueMs),
          lte(checkpointTimer.nextDueMs, now),
          // The digital twin applies the timeouts of its checkpoints itself, on their virtual day.
          sql`${checkpoint.settings} -> 'twin' IS NULL`,
          only,
        ),
      )
      .orderBy(asc(checkpointTimer.nextDueMs));
    for (const row of due) {
      // The same key for the same timeout, from any server or route: it is applied once.
      const key = `advance:${row.serviceDay}:${String(row.nextDueMs)}`;
      await this.runtime.execute({
        checkpointId: row.checkpointId,
        idempotencyKey: key,
        requestHash: sha256(key),
        actor: 'system:timer',
        build: () => ({ type: 'ADVANCE' }),
      });
    }
    return due.length;
  }
}
