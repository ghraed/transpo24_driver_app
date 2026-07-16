import { Redirect, useLocalSearchParams } from 'expo-router';

type PickupParams = {
  tripId?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
};

export default function PickupItemRedirectScreen() {
  const params = useLocalSearchParams<PickupParams>();

  return <Redirect href={{ pathname: '/go-to-pickup', params }} />;
}
