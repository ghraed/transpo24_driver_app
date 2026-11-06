import { expect, it, jest } from '@jest/globals';
import { redirectSystemPath } from '../app/+native-intent';
jest.mock('@/lib/pending-request-link', () => ({ queueRequestLink: jest.fn(async () => true) }));
it('warm links keep the authenticated navigator mounted, cold links wait on the login route', async () => {
  const path = 'transpo24-driver-staging://accepted-job-details?requestId=owned';
  await expect(redirectSystemPath({ path, initial: false })).resolves.toBeNull();
  await expect(redirectSystemPath({ path, initial: true })).resolves.toBe('/');
});
