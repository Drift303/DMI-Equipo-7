import { redactForTelemetry } from '../src/course-evaluation';

test('redacts nested sensitive fields without mutating the input', () => {
  const input = {
    incidentId: 'campus-inc-001',
    context: {
      assigned_technician_id: 'technician-1',
      correlationId: 'corr-001',
      notes: [{ internal_comments: 'Nota ficticia' }],
    },
    metadata: [{ latitude: 19.4, attempt: 2 }],
  };
  const snapshot = structuredClone(input);

  expect(redactForTelemetry(input)).toEqual({
    incidentId: 'campus-inc-001',
    context: {
      assigned_technician_id: '[REDACTED]',
      correlationId: 'corr-001',
      notes: [{ internal_comments: '[REDACTED]' }],
    },
    metadata: [{ latitude: '[REDACTED]', attempt: 2 }],
  });
  expect(input).toEqual(snapshot);
});
