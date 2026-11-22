import type { CheckpointEstimates } from '@gateflow/priority-engine';
import type { CheckpointQueue, StaffActionOutcome, TicketState } from '../src';

/** The staff actions of the live product (S15), as the tests name them. */
export const ACTIONS = [
  'recall',
  'noShow',
  'reactivate',
  'hold',
  'release',
  'reject',
  'cancel',
  'grow',
] as const;
export type Action = (typeof ACTIONS)[number];

export function act(
  q: CheckpointQueue,
  action: Action,
  id: string,
  now: number,
  estimates: CheckpointEstimates,
): StaffActionOutcome {
  switch (action) {
    case 'recall':
      return q.recall(id, now, estimates);
    case 'noShow':
      return q.markNoShow(id, now, estimates);
    case 'reactivate':
      return q.reactivate(id, now, estimates);
    case 'hold':
      return q.hold(id, now, estimates);
    case 'release':
      return q.resolve(id, 'QUEUE', now, estimates);
    case 'reject':
      return q.resolve(id, 'CANCEL', now, estimates);
    case 'cancel':
      return q.cancel(id, now, estimates);
    case 'grow':
      return q.grow(id, 1, now, estimates);
  }
}

/**
 * The ticket's state machine for staff actions (kickoff 2.8): the state each allowed action leads
 * to. An action missing from a state's row is refused.
 */
export const TRANSITIONS: Readonly<Record<TicketState, Partial<Record<Action, TicketState>>>> = {
  QUEUED: { hold: 'REVIEW', cancel: 'CANCELLED', grow: 'QUEUED' },
  PREPARE: { hold: 'REVIEW', cancel: 'CANCELLED', grow: 'PREPARE' },
  CALLED: { recall: 'RECALLED', noShow: 'NO_SHOW', cancel: 'CANCELLED' },
  RECALLED: { recall: 'RECALLED', noShow: 'NO_SHOW', cancel: 'CANCELLED' },
  NO_SHOW: { reactivate: 'QUEUED', cancel: 'CANCELLED' },
  ADMITTED: {},
  EXPIRED: {},
  REVIEW: { release: 'QUEUED', reject: 'CANCELLED', cancel: 'CANCELLED' },
  CANCELLED: {},
};

/**
 * The states a ticket may be in right after an allowed action: a ticket back in the queue may be
 * committed to the prepare window at once, and a no-show with no reactivation left expires.
 */
export function statesAfter(target: TicketState): readonly TicketState[] {
  if (target === 'QUEUED') return ['QUEUED', 'PREPARE'];
  if (target === 'NO_SHOW') return ['NO_SHOW', 'EXPIRED'];
  return [target];
}
