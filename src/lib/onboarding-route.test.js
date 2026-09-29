import { resolveDriverEntryRoute } from './onboarding-route';

it('resumes a rejected driver in the saved correction step', () => {
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/vehicle-documents', 'REJECTED')).toBe('/vehicle-documents');
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/vehicle-information?flow=onboarding', 'REJECTED'))
    .toBe('/vehicle-information?flow=onboarding');
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/load-capacity?vehicleId=vehicle-1&flow=onboarding', 'REJECTED'))
    .toBe('/load-capacity?vehicleId=vehicle-1&flow=onboarding');
});

it('keeps pending and suspended drivers on the review screen', () => {
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/vehicle-documents', 'PENDING_REVIEW')).toBe('/waiting-approval');
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/vehicle-documents', 'SUSPENDED')).toBe('/waiting-approval');
  expect(resolveDriverEntryRoute('WAITING_APPROVAL', '/receive-requests', 'REJECTED')).toBe('/waiting-approval');
});
