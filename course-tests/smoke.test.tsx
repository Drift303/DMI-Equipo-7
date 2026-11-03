import { fireEvent, render, waitFor } from '@testing-library/react-native';

import App from '../App';
import { locationClient } from '../src/campusops/infrastructure/dependencies';

jest.mock('../src/api/courseBackend', () => ({
  getBackendHealth: jest.fn().mockResolvedValue({
    ok: true,
    service: 'dmi-controlled-backend',
    contractVersion: 1,
  }),
}));

jest.mock('../src/campusops/infrastructure/dependencies', () => {
  const actual = jest.requireActual('../src/campusops/infrastructure/dependencies');
  return {
    ...actual,
    locationClient: { geocode: jest.fn() },
  };
});

test('renders the reproducible baseline and resolves backend state', async () => {
  const view = await render(<App />);
  expect(view.getByText('CampusOps')).toBeTruthy();
  expect(view.getByTestId('manual-location-input')).toBeTruthy();
  await waitFor(() => expect(view.getByTestId('backend-status').props.children.join('')).toContain('available'));
});

test('allows a manual incident location when geocoding is unavailable', async () => {
  const geocode = jest.mocked(locationClient.geocode);
  geocode.mockRejectedValue(new Error('simulated provider outage'));
  const view = await render(<App />);
  await waitFor(() => expect(view.getByTestId('backend-status').props.children.join('')).toContain('available'));
  await fireEvent.changeText(view.getByTestId('manual-location-input'), 'Edificio ficticio B, zona norte');
  expect(view.getByTestId('manual-location-input').props.value).toBe('Edificio ficticio B, zona norte');

  await fireEvent.press(view.getByTestId('geocode-location-button'));

  await waitFor(() => {
    expect(view.getByTestId('selected-location').props.children.join('')).toContain(
      'Ubicación seleccionada (manual): Edificio ficticio B, zona norte',
    );
  });
  expect(view.getByTestId('manual-location-input').props.value).toBe('Edificio ficticio B, zona norte');
  expect(view.getByText('Ubicación textual; no se asignaron coordenadas.')).toBeTruthy();
});

test('shows only coordinates returned by a valid provider result', async () => {
  const geocode = jest.mocked(locationClient.geocode);
  geocode.mockResolvedValue({
    label: 'Zona sintética',
    latitude: 0,
    longitude: 0,
  });
  const view = await render(<App />);
  await waitFor(() => expect(view.getByTestId('backend-status').props.children.join('')).toContain('available'));
  await fireEvent.changeText(view.getByTestId('manual-location-input'), 'Zona sintética');
  await fireEvent.press(view.getByTestId('geocode-location-button'));

  await waitFor(() => {
    expect(view.getByTestId('selected-location').props.children.join('')).toContain(
      'Ubicación seleccionada (provider): Zona sintética',
    );
    expect(view.getByText('Coordenadas recibidas del proveedor: 0, 0')).toBeTruthy();
  });
});

 