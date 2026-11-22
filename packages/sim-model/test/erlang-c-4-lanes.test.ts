import { describe, it } from 'vitest';
import { checkAgainstErlangC } from './erlang-c';

describe('M/M/c validation against Erlang C', () => {
  it(
    'c = 4, rho = 0.85: mean wait within 3% and inside the simultaneous 95% CI',
    { timeout: 600_000 },
    () => {
      checkAgainstErlangC({ configuration: 1, lanes: 4, rho: 0.85, customers: 100_000 });
    },
  );
});
