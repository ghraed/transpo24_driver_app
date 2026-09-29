import { getRejectedVehicleUploadsToReplace } from './vehicle-review-recovery';

it('requires replacement of rejected vehicle files before resubmission', () => {
  const vehicle = {
    status: 'REJECTED',
    documents: [
      { type: 'VEHICLE_FRONT_PHOTO', status: 'REJECTED' },
      { type: 'VEHICLE_REAR_PHOTO', status: 'APPROVED' },
    ],
  };
  const form = { frontPhoto: { uri: 'file://new-front.jpg' } };
  const missing = getRejectedVehicleUploadsToReplace(vehicle, form);
  expect(missing.map(item => item.field)).not.toContain('frontPhoto');
  expect(missing.map(item => item.field)).not.toContain('rearPhoto');
  expect(missing.map(item => item.field)).toContain('insuranceDocument');
  expect(missing).toHaveLength(5);
});

it('does not require replacements for a vehicle that is not rejected', () => {
  expect(getRejectedVehicleUploadsToReplace({ status: 'PENDING_REVIEW', documents: [] }, {})).toEqual([]);
});
