import { selectIncidentLocation } from '../src/course-evaluation';

describe('selectIncidentLocation manual fallback', () => {
  const manualLabel = ' Edificio manual ';

  test.each([
    ['null response', null],
    ['missing response', undefined],
    ['HTTP 429 response', { status: 429 }],
    ['missing coordinates', { label: 'Zona incompleta', latitude: 19.4 }],
    ['blank label', { label: '   ', latitude: 19.4, longitude: -99.1 }],
    ['string latitude', { label: 'Zona inválida', latitude: '19.4', longitude: -99.1 }],
    ['NaN latitude', { label: 'Zona inválida', latitude: Number.NaN, longitude: -99.1 }],
    ['infinite longitude', { label: 'Zona inválida', latitude: 19.4, longitude: Number.POSITIVE_INFINITY }],
    ['latitude out of range', { label: 'Zona inválida', latitude: 90.1, longitude: -99.1 }],
    ['longitude out of range', { label: 'Zona inválida', latitude: 19.4, longitude: -180.1 }],
    ['array response', [{ label: 'Zona inválida', latitude: 19.4, longitude: -99.1 }]],
  ])('uses the manual location for %s', (_scenario, provider) => {
    expect(selectIncidentLocation(provider, manualLabel)).toEqual({
      source: 'manual',
      label: 'Edificio manual',
    });
  });

  test.each([
    [-90, -180],
    [0, 0],
    [90, 180],
  ])('accepts valid boundary coordinates (%s, %s)', (latitude, longitude) => {
    expect(selectIncidentLocation({
      label: ' Zona válida ',
      latitude,
      longitude,
    }, manualLabel)).toEqual({
      source: 'provider',
      label: 'Zona válida',
      latitude,
      longitude,
    });
  });

  test('uses a non-empty manual label when the supplied label is blank', () => {
    expect(selectIncidentLocation(null, '   ')).toEqual({
      source: 'manual',
      label: 'Ubicación manual',
    });
  });
});
