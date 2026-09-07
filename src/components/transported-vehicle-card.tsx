import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TransportedVehicleDetails } from '@/types/auth';

export function TransportedVehicleCard({ vehicle }: { vehicle: TransportedVehicleDetails }) {
  const { t, i18n } = useTranslation();
  return <View style={styles.card}>
    <Text style={styles.title}>{t('Vehicle Details')}</Text>
    <Text style={styles.name}>{vehicle.brand} {vehicle.model}, {vehicle.manufactureYear}</Text>
    {vehicle.estimatedWeightKg ? <Text>{vehicle.estimatedWeightKg.toLocaleString(i18n.language)} kg</Text> : null}
    {vehicle.bodyType ? <Text>{t(`vehicleRequest.body.${vehicle.bodyType}`, { defaultValue: vehicle.bodyType })}</Text> : null}
    {vehicle.transmission ? <Text>{t(`vehicleRequest.transmissionType.${vehicle.transmission}`, { defaultValue: vehicle.transmission })}</Text> : null}
    {vehicle.mobility ? <Text>{t(`vehicleRequest.mobility.${vehicle.mobility}`)}</Text> : vehicle.condition ? <Text>{t(vehicle.condition)}</Text> : null}
    {vehicle.issues?.map(issue => <Text key={issue}>{t(`vehicleRequest.issue.${issue}`)}</Text>)}
    {vehicle.conditionNotes ? <Text>{vehicle.conditionNotes}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 18, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', gap: 10 }, title: { fontSize: 18, fontWeight: '700', color: '#0F172A' }, name: { fontSize: 16, fontWeight: '600' } });
