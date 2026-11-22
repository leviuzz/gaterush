import { RISK_CLASSES, SEGMENTS } from '@gateflow/domain';
import { describe, expect, it } from 'vitest';
import {
  AdmissionRequest,
  DeviceResponse,
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
    // No answer holds personal data; only the scan request carries the boarding pass in, to be
    // read in memory (ADR-043).
    const fieldsOf = (node: unknown): string[] => {
      const fields: string[] = [];
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (typeof n === 'object' && n !== null) {
          const record = n as Record<string, unknown>;
          const properties = record.properties;
          if (typeof properties === 'object' && properties !== null) {
            fields.push(...Object.keys(properties));
          }
          Object.values(record).forEach(walk);
        }
      };
      walk(node);
      return fields;
    };
    const personal = /name|surname|pnr|passport|seat|bcbp|email|phone/i;
    let answers = 0;
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const operation of Object.values(methods) as {
        responses: unknown;
        requestBody?: unknown;
      }[]) {
        for (const field of fieldsOf(operation.responses)) {
          answers++;
          expect(field).not.toMatch(personal);
        }
        const inputs = fieldsOf(operation.requestBody);
        const allowed = path.endsWith('/scans') ? ['bcbp'] : [];
        for (const field of inputs) {
          if (!allowed.includes(field)) expect(field).not.toMatch(personal);
        }
      }
    }
    expect(answers).toBeGreaterThan(10);
  });

  it('mark the routes only a registered device may call (S14)', () => {
    const doc = openApiDocument('0.14.0') as {
      paths: Record<string, Record<string, { security?: unknown }>>;
      components: { securitySchemes: Record<string, { type: string; scheme: string }> };
    };
    expect(doc.components.securitySchemes.device).toMatchObject({ type: 'http', scheme: 'bearer' });
    const guarded = ROUTES.filter((r) => r.device === true).map((r) => `${r.method} ${r.path}`);
    expect(guarded).toEqual([
      'post /v1/checkpoints/{checkpointId}/scans',
      'get /v1/devices/me',
      'get /v1/checkpoints/{checkpointId}/demo-flights',
    ]);
    for (const route of ROUTES) {
      const operation = doc.paths[route.path]?.[route.method];
      expect(operation?.security, `${route.method} ${route.path}`).toEqual(
        route.device === true ? [{ device: [] }] : undefined,
      );
    }
    const id = '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b';
    expect(
      DeviceResponse.safeParse({
        device: { id, kind: 'KIOSK', label: 'Kiosk 1' },
        checkpoint: { id, label: 'Main checkpoint' },
        airport: {
          label: 'Synthetic airport',
          iata: 'XXX',
          timeZone: 'Europe/Rome',
          synthetic: true,
        },
      }).success,
    ).toBe(true);
  });
});
