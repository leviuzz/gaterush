import { RISK_CLASSES, SEGMENTS } from '@gateflow/domain';
import { CHECKPOINT_MODES, TICKET_STATES } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import {
  AdmissionRequest,
  CheckpointMode,
  DeviceResponse,
  DisplayMessage,
  IssueTicketRequest,
  RiskClass,
  Segment,
  SetModeRequest,
  TicketState,
  ROUTES,
  openApiDocument,
} from '../src';

describe('the API contracts', () => {
  it('use the vocabulary of the domain', () => {
    expect(Segment.options).toEqual([...SEGMENTS]);
    expect(RiskClass.options).toEqual([...RISK_CLASSES]);
    // The states of a ticket are the queue's own (S15 added REVIEW and CANCELLED).
    expect(TicketState.options).toEqual([...TICKET_STATES]);
    // The modes of a checkpoint are the queue's own (S17).
    expect(CheckpointMode.options).toEqual([...CHECKPOINT_MODES]);
  });

  it('validate requests strictly', () => {
    const flightId = '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b';
    const manual = { flightId, segment: 'DEPARTING', reason: 'NO_BOARDING_PASS' } as const;
    expect(IssueTicketRequest.parse(manual)).toEqual({ ...manual, partySize: 1 });
    // A manual ticket has a coded reason (S15), never a free text or a name.
    expect(IssueTicketRequest.safeParse({ flightId, segment: 'DEPARTING' }).success).toBe(false);
    expect(IssueTicketRequest.safeParse({ ...manual, reason: 'he looked late' }).success).toBe(
      false,
    );
    expect(IssueTicketRequest.safeParse({ ...manual, name: 'Mario' }).success).toBe(false);
    expect(IssueTicketRequest.safeParse({ ...manual, partySize: 0 }).success).toBe(false);
    expect(AdmissionRequest.safeParse({ number: 'A001' }).success).toBe(true);
    expect(AdmissionRequest.safeParse({ ref: 'x'.repeat(22) }).success).toBe(true);
    expect(AdmissionRequest.safeParse({ number: 'A001', ref: 'x'.repeat(22) }).success).toBe(false);
    // A change of mode (S17): a known mode, a reset only when said.
    expect(SetModeRequest.parse({ mode: 'PAUSED' })).toEqual({ mode: 'PAUSED', reset: false });
    expect(SetModeRequest.safeParse({ mode: 'CLOSED' }).success).toBe(false);
    expect(SetModeRequest.safeParse({ mode: 'NORMAL', reset: 'yes' }).success).toBe(false);
    expect(SetModeRequest.safeParse({ mode: 'NORMAL', why: 'lunch' }).success).toBe(false);
  });

  it('give an OpenAPI document with every route', () => {
    const doc = openApiDocument('0.12.0') as { paths: Record<string, Record<string, unknown>> };
    for (const route of ROUTES) expect(doc.paths[route.path]?.[route.method]).toBeDefined();
    // No answer holds personal data; only a scan, or a presentation at the access point, carries
    // the boarding pass in, to be read in memory (ADR-043, S15).
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
        const allowed = path.endsWith('/scans') || path.endsWith('/admissions') ? ['bcbp'] : [];
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
      'get /v1/checkpoints/{checkpointId}/display',
      'get /v1/checkpoints/{checkpointId}/kiosk',
      'get /v1/checkpoints/{checkpointId}/demo-flights',
    ]);
    for (const route of ROUTES) {
      const operation = doc.paths[route.path]?.[route.method];
      expect(operation?.security, `${route.method} ${route.path}`).toEqual(
        route.device === true
          ? [{ device: [] }]
          : route.staff !== undefined
            ? [{ staff: [] }]
            : undefined,
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

  it('describe the streams as server-sent events that Last-Event-ID resumes (S16)', () => {
    const doc = openApiDocument('0.16.0') as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters: { name: string; in: string }[];
            responses: Record<string, { content: Record<string, unknown> }>;
          }
        >
      >;
    };
    const streams = ROUTES.filter((r) => r.stream === true).map((r) => r.path);
    expect(streams).toEqual([
      '/v1/checkpoints/{checkpointId}/display',
      '/v1/checkpoints/{checkpointId}/stream',
      '/v1/checkpoints/{checkpointId}/kiosk',
    ]);
    for (const path of streams) {
      const operation = doc.paths[path]?.get;
      expect(Object.keys(operation?.responses['200']?.content ?? {})).toEqual([
        'text/event-stream',
      ]);
      expect(Object.keys(operation?.responses['401']?.content ?? {})).toEqual(['application/json']);
      expect(operation?.parameters).toContainEqual(
        expect.objectContaining({ name: 'Last-Event-ID', in: 'header' }),
      );
    }
    // A display's message: numbers only.
    const message = {
      seq: 42,
      board: {
        serviceDay: '2026-11-23',
        called: [{ number: 'A012', second: false, at: '2026-11-23T06:10:00.000Z' }],
        prepare: ['A013', 'A014'],
        mode: 'NORMAL',
        updatedAt: '2026-11-23T06:10:00.000Z',
      },
      calls: [{ number: 'A012', second: false, at: '2026-11-23T06:10:00.000Z' }],
    };
    expect(DisplayMessage.parse(message)).toEqual(message);
  });

  it('mark the routes only staff may call, with the role each needs (S15)', () => {
    const doc = openApiDocument('0.15.0') as {
      paths: Record<string, Record<string, { 'x-gateflow-role'?: string }>>;
      components: { securitySchemes: Record<string, { type: string; in?: string }> };
    };
    expect(doc.components.securitySchemes.staff).toMatchObject({ type: 'apiKey', in: 'cookie' });
    const roles = Object.fromEntries(
      ROUTES.filter((r) => r.staff !== undefined).map((r) => [`${r.method} ${r.path}`, r.staff]),
    );
    const cp = '/v1/checkpoints/{checkpointId}';
    expect(roles).toEqual({
      [`post ${cp}/tickets`]: 'OPERATOR',
      [`post ${cp}/calls`]: 'OPERATOR',
      [`post ${cp}/mode`]: 'SUPERVISOR',
      [`post ${cp}/admissions`]: 'OPERATOR',
      [`post ${cp}/tickets/{ticketId}/recall`]: 'OPERATOR',
      [`post ${cp}/tickets/{ticketId}/no-show`]: 'OPERATOR',
      [`post ${cp}/tickets/{ticketId}/reactivate`]: 'OPERATOR',
      [`post ${cp}/tickets/{ticketId}/review`]: 'OPERATOR',
      [`post ${cp}/tickets/{ticketId}/cancel`]: 'SUPERVISOR',
      [`post ${cp}/tickets/{ticketId}/resolve`]: 'SUPERVISOR',
      [`get ${cp}`]: 'OPERATOR',
      [`get ${cp}/flights`]: 'OPERATOR',
      [`get ${cp}/queue`]: 'OPERATOR',
      [`get ${cp}/audit/verify`]: 'SUPERVISOR',
      [`get ${cp}/stream`]: 'OPERATOR',
    });
    for (const [key, role] of Object.entries(roles)) {
      const [method = '', path = ''] = key.split(' ');
      expect(doc.paths[path]?.[method]?.['x-gateflow-role']).toBe(role);
    }
  });
});
