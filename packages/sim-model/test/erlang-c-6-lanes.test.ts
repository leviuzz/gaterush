import { describe, it } from 'vitest';
import { checkAgainstErlangC } from './erlang-c';

describe('M/M/c validation against Erlang C', () => {
  it(
    'c = 6, rho = 0.9: mean wait within 3% and inside the simultaneous 95% CI',
    { timeout: 180_000 },
    () => {
      checkAgainstErlangC({ configuration: 2, lanes: 6, rho: 0.9, customers: 200_000 });
    },
  );
});
