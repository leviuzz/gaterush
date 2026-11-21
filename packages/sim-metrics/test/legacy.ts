import type { Scenario } from '@gateflow/sim-scenarios';

/**
 * The scenario without the passenger features added in slice S3: single passengers only, no
 * assisted path and no strategic late arrivals. Used by the regression tests against S1 and S2.
 */
export function withoutS3Features(scenario: Scenario): Scenario {
  return {
    ...scenario,
    passengers: {
      ...scenario.passengers,
      groups: { value: { partySizes: [{ size: 1, share: 1 }] }, source: 'SYNTHETIC' },
      assistedShare: { value: 0, source: 'SYNTHETIC' },
      strategicLateArrival: {
        value: { ...scenario.passengers.strategicLateArrival.value, share: 0 },
        source: 'SYNTHETIC',
      },
    },
  };
}
