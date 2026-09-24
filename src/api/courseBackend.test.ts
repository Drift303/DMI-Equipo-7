import { resolveBackendUrl } from './courseBackend';

describe('resolveBackendUrl', () => {
  it('accepts an HTTP(S) endpoint without credentials', () => {
    expect(resolveBackendUrl('https://api.campusops.test/v1/')).toBe('https://api.campusops.test/v1');
  });

  it.each([
    'ftp://api.campusops.test',
    'https://demo-user:demo-password@api.campusops.test',
    'not a URL',
  ])('rejects an unsafe endpoint configuration: %s', (value) => {
    expect(() => resolveBackendUrl(value)).toThrow('Backend URL configuration is invalid');
  });
});
