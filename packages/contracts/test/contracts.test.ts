import { RISK_CLASSES, SEGMENTS } from '@gateflow/domain';
import { describe, expect, it } from 'vitest';
import {
  AdmissionRequest,
  IssueTicketRequest,
  RiskClass,
  Segment,
  ROUTES,
  openApiDocument,
} from '../src';

describe('the API contracts', () => {
  it('use the vocabulary of the domain', () => {
    expect(Segment.options).toEqual([...SEGMENTS]);
    expect(RiskClass.options).toEqual([...RISK_CLASSES]);
  });

  it('validate requests strictly', () => {
    const flightId = '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b';
    expect(IssueTicketRequest.parse({ flightId, segment: 'DEPARTING' })).toEqual({
      flightId,
      segment: 'DEPARTING',
      partySize: 1,
    });
    expect(
      IssueTicketRequest.safeParse({ flightId, segment: 'DEPARTING', name: 'Mario' }).success,
    ).toBe(false);
    expect(
      IssueTicketRequest.safeParse({ flightId, segment: 'DEPARTING', partySize: 0 }).success,
    ).toBe(false);
    expect(AdmissionRequest.safeParse({ number: 'A001' }).success).toBe(true);
    expect(AdmissionRequest.safeParse({ ref: 'x'.repeat(22) }).success).toBe(true);
    expect(AdmissionRequest.safeParse({ number: 'A001', ref: 'x'.repeat(22) }).success).toBe(false);
  });

  it('give an OpenAPI document with every route', () => {
    const doc = openApiDocument('0.12.0') as { paths: Record<string, Record<string, unknown>> };
    for (const route of ROUTES) expect(doc.paths[route.path]?.[route.method]).toBeDefined();
    // No field of any schema holds personal data.
    const fields: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (typeof node === 'object' && node !== null) {
        const record = node as Record<string, unknown>;
        const properties = record.properties;
        if (typeof properties === 'object' && properties !== null) {
          fields.push(...Object.keys(properties));
        }
        Object.values(record).forEach(walk);
      }
    };
    walk(doc);
    expect(fields.length).toBeGreaterThan(10);
    for (const field of fields) {
      expect(field).not.toMatch(/name|surname|pnr|passport|seat|bcbp|email|phone/i);
    }
  });
});
