import { describe, it } from 'vitest';
import { checkAgainstErlangC } from './erlang-c';

describe('M/M/c validation against Erlang C', () => {
  it(
    'c = 1, rho = 0.8: mean wait within 3% and inside the simultaneous 95% CI',
    { timeout: 180_000 },
    () => {
      checkAgainstErlangC({ configuration: 0, lanes: 1, rho: 0.8, customers: 100_000 });
    },
  );
});
