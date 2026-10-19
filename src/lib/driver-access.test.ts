import { describe, it, expect } from '@jest/globals';
import { canDriverInteract, registrationRoute, requiresDriverApproval } from './driver-access';
import { resolveDriverEntryRoute } from './onboarding-route';

describe('driver browsing and interaction routes', () => {
  it.each(['COMPLETE_PROFILE', 'UPLOAD_DOCUMENTS', 'SET_AVAILABILITY', 'WAITING_APPROVAL', 'HOME'] as const)('opens the app for a phone-verified driver at %s', (step) => {
    expect(resolveDriverEntryRoute(step, '/complete-profile')).toBe('/receive-requests');
  });
  it.each(['PENDING_PROFILE', 'PENDING_DOCUMENTS', 'PENDING_REVIEW', 'SUSPENDED', 'REJECTED'] as const)('requires admin approval for %s', (status) => {
    expect(canDriverInteract({ status, isProfileCompleted: true })).toBe(false);
  });
  it('requires profile completion as well as approval', () => {
    expect(canDriverInteract({ status: 'APPROVED', isProfileCompleted: false })).toBe(false);
    expect(canDriverInteract({ status: 'APPROVED', isProfileCompleted: true })).toBe(true);
    expect(canDriverInteract(null)).toBe(false);
  });
  it.each(['/receive-requests', '/driver-map', '/driver-profile', '/driver-chats', '/driver-home', '/complete-profile', '/vehicle-documents'])('allows browsing or registering at %s', (route) => {
    expect(requiresDriverApproval(route)).toBe(false);
  });
  it.each(['/send-price-offer', '/chat', '/accepted-job-details', '/go-to-pickup', '/pickup-item', '/deliver-item', '/trip-expenses', '/review-request-details'])('protects client route %s including deep links', (route) => {
    expect(requiresDriverApproval(route)).toBe(true);
  });
  it('redirects to the outstanding registration stage', () => {
    expect(registrationRoute({ status: 'PENDING_PROFILE', isProfileCompleted: false })).toBe('/complete-profile');
    expect(registrationRoute({ status: 'PENDING_DOCUMENTS', isProfileCompleted: true })).toBe('/vehicle-documents');
    expect(registrationRoute({ status: 'PENDING_REVIEW', isProfileCompleted: true })).toBe('/waiting-approval');
  });
});
