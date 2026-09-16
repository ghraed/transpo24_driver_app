// Verify the server before transmitting a device token. Older servers fail closed.
export async function assertPushBackend(
  apiBaseUrl: string,
  applicationId: string,
  request: (url: string) => Promise<Response>,
): Promise<void> {
  const response = await request(`${apiBaseUrl}/push-tokens/environment`);
  if (!response.ok) throw new Error('The backend does not support isolated push registration.');
  const config = await response.json();
  const expectedEnvironment = applicationId.endsWith('.dev') ? 'DEVELOPMENT' : 'PRODUCTION';
  if (config?.environment !== expectedEnvironment ||
      !Array.isArray(config?.applicationIds) || !config.applicationIds.includes(applicationId)) {
    throw new Error('Notification registration is blocked: app and backend environments do not match.');
  }
}
