import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TransportedVehicleDetails } from '@/types/auth';

type VehicleFieldProps = {
  label: string;
  value: string | number | null | undefined;
  stacked?: boolean;
};

function VehicleField({ label, value, stacked = false }: VehicleFieldProps) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={[styles.field, stacked && styles.stackedField]}>
      <Text style={[styles.fieldLabel, stacked && styles.stackedLabel]}>{label}</Text>
      <Text style={[styles.fieldValue, stacked && styles.stackedValue]}>{value}</Text>
    </View>
  );
}

export function TransportedVehicleCard({ vehicle }: { vehicle: TransportedVehicleDetails }) {
  const { t, i18n } = useTranslation();
  const issues = vehicle.issues?.map((issue) => t(`vehicleRequest.issue.${issue}`, { defaultValue: issue })).join(', ');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('Vehicle Details')}</Text>
      <View style={styles.fields}>
        <VehicleField label={t('vehicleDetails.brand')} value={vehicle.brand || t('N/A')} />
        <VehicleField label={t('vehicleDetails.model')} value={vehicle.model || t('N/A')} />
        <VehicleField label={t('vehicleDetails.year')} value={vehicle.manufactureYear ?? t('N/A')} />
        <VehicleField label={t('vehicleDetails.vin')} value={vehicle.vin} />
        <VehicleField label={t('vehicleDetails.series')} value={vehicle.series} />
        <VehicleField label={t('vehicleDetails.variant')} value={vehicle.variant} />
        <VehicleField
          label={t('vehicleDetails.weight')}
          value={vehicle.estimatedWeightKg != null ? `${vehicle.estimatedWeightKg.toLocaleString(i18n.language)} kg` : null}
        />
        <VehicleField
          label={t('vehicleDetails.bodyType')}
          value={vehicle.bodyType ? t(`vehicleRequest.body.${vehicle.bodyType}`, { defaultValue: vehicle.bodyType }) : null}
        />
        <VehicleField
          label={t('vehicleDetails.transmission')}
          value={vehicle.transmission ? t(`vehicleRequest.transmissionType.${vehicle.transmission}`, { defaultValue: vehicle.transmission }) : null}
        />
        <VehicleField
          label={t('vehicleDetails.mobility')}
          value={vehicle.mobility ? t(`vehicleRequest.mobility.${vehicle.mobility}`, { defaultValue: vehicle.mobility }) : null}
        />
        <VehicleField label={t('vehicleDetails.condition')} value={vehicle.condition ? t(vehicle.condition) : null} />
        <VehicleField label={t('vehicleDetails.issues')} value={issues} stacked />
        <VehicleField label={t('vehicleDetails.conditionNotes')} value={vehicle.conditionNotes} stacked />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#172033' },
  fields: { borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  field: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  fieldLabel: { width: '38%', fontSize: 13, color: '#64748B' },
  fieldValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#172033', textAlign: 'right' },
  stackedField: { flexDirection: 'column', gap: 5 },
  stackedLabel: { width: '100%' },
  stackedValue: { textAlign: 'left' },
});
