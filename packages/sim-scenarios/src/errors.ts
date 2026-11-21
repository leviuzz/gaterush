/** Thrown when a scenario or one of its files cannot be parsed or violates the schema. */
export class ScenarioValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`invalid scenario:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ScenarioValidationError';
    this.issues = issues;
  }
}
