export type BackendHealth = Readonly<{
  ok: true;
  service: 'dmi-controlled-backend';
  contractVersion: 1;
}>;

const DEFAULT_URL = 'http://127.0.0.1:4310';

/** Rejects unsafe endpoint configuration before it can reach logs or network requests. */
export function resolveBackendUrl(
  configuredUrl = process.env.EXPO_PUBLIC_COURSE_BACKEND_URL,
): string {
  const candidate = configuredUrl?.trim() || DEFAULT_URL;

  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username.length > 0
      || url.password.length > 0
    ) {
      throw new Error('unsafe backend URL');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error('Backend URL configuration is invalid');
  }
}

export async function getBackendHealth(
  baseUrl = resolveBackendUrl(),
): Promise<BackendHealth> {
  let response: Response;
  try {
    response = await fetch(`${resolveBackendUrl(baseUrl)}/health`);
  } catch {
    throw new Error('Backend health request failed');
  }
  if (!response.ok) {
    throw new Error(`Backend health failed with ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('ok' in payload) ||
    payload.ok !== true ||
    !('contractVersion' in payload) ||
    payload.contractVersion !== 1
  ) {
    throw new Error('Backend health contract mismatch');
  }
  return payload as BackendHealth;
}
