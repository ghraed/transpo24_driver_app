import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/auth-context';
import {
  getDriverDocumentsStatus,
  getDriverVehicle,
  submitDriverDocumentsForReview,
} from '@/lib/api';
import {
  clearLastOnboardingRoute,
  clearLoadCapacityDraft,
  clearOnboardingDocumentsStatus,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import { getReviewReadiness, isReviewSubmittedForVehicle } from '@/lib/driver-review-readiness';
import { REQUIRED_VEHICLE_UPLOADS } from '@/lib/vehicle-document-requirements';
import { VEHICLE_TYPE_LABELS, formatCargoTypes } from '@/lib/vehicle-load-capacity';
import { LANGUAGE_CONFIGS, isSupportedLanguage } from '@/localization/languages';
import { nextStepToRoute } from '@/lib/onboarding-route';
import type { DriverDocumentsStatusResponse, DriverProfile, DriverVehicle } from '@/types/auth';

const PERSONAL_DOCUMENT_LABELS: Record<string, string> = {
  PERSONAL_SELFIE: 'Personal selfie',
  ID_FRONT: 'ID front',
  ID_BACK: 'ID back',
  DRIVING_LICENSE: 'Driving license',
  SELF_IDENTITY_VERIFICATION: 'Self identity verification',
};
const VEHICLE_CONDITION_LABELS: Record<string, string> = {
  EXCELLENT: 'Excellent', GOOD: 'Good', NEEDS_MAINTENANCE: 'Needs Maintenance',
};
const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  UPLOADED: 'Uploaded',
  PENDING_REVIEW: 'Pending review',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export default function CheckDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { vehicleId: routeVehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const vehicleId = typeof routeVehicleId === 'string' ? routeVehicleId : '';
  const { refreshDriverMe } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [documents, setDocuments] = useState<DriverDocumentsStatusResponse | null>(null);
  const [vehicle, setVehicle] = useState<DriverVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (vehicleId) {
      void persistLastOnboardingRoute(`/check-details?vehicleId=${encodeURIComponent(vehicleId)}`);
    }
  }, [vehicleId]);

  const loadDetails = useCallback(async () => {
    if (!vehicleId) {
      setError(t('Vehicle ID is missing.'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [me, status, selectedVehicle] = await Promise.all([
        refreshDriverMe(), getDriverDocumentsStatus(), getDriverVehicle(vehicleId),
      ]);
      if (status.onboardingStatus === 'PENDING_REVIEW') {
        router.replace('/waiting-approval');
        return;
      }
      if (me.driver.status === 'APPROVED') {
        router.replace(nextStepToRoute(me.nextStep));
        return;
      }
      setProfile(me.driver);
      setDocuments(status);
      setVehicle(selectedVehicle);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Failed to load details.'));
    } finally {
      setLoading(false);
    }
  }, [refreshDriverMe, router, t, vehicleId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadDetails(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadDetails]);

  const finishSubmission = async () => {
    await Promise.allSettled([
      clearLastOnboardingRoute(),
      clearLoadCapacityDraft(vehicleId),
      clearOnboardingDocumentsStatus(),
    ]);
    router.replace('/waiting-approval');
  };

  const submit = async () => {
    if (!profile || !documents || !vehicle || submitting) return;
    const readiness = getReviewReadiness(profile, documents, vehicle);
    if (!Object.values(readiness).every(Boolean)) return;
    setSubmitting(true);
    setError('');
    try {
      await submitDriverDocumentsForReview(vehicleId);
      await finishSubmission();
    } catch (cause) {
      // A response can be lost after the server commits the review. Check before offering a retry.
      try {
        const latest = await getDriverDocumentsStatus();
        if (isReviewSubmittedForVehicle(latest, vehicleId)) {
          await finishSubmission();
          return;
        }
        setDocuments(latest);
        if (latest.onboardingStatus === 'PENDING_REVIEW') {
          setError(t('A different vehicle is already under review. Refresh your status.'));
          return;
        }
      } catch {
        setError(t('Could not confirm submission status. Your details remain saved. Check your connection, then try again.'));
        return;
      }
      setError(cause instanceof Error ? cause.message : t('Submission failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator /><Text>{t('Loading details...')}</Text></View>;
  }
  if (!profile || !documents || !vehicle) {
    return <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void loadDetails()}><Text style={styles.link}>{t('Retry')}</Text></Pressable></View>;
  }

  const readiness = getReviewReadiness(profile, documents, vehicle);
  const allReady = Object.values(readiness).every(Boolean);
  const routeSuffix = `vehicleId=${encodeURIComponent(vehicleId)}&returnTo=check-details`;
  const documentLabel = (type: string) => t(PERSONAL_DOCUMENT_LABELS[type] ??
    REQUIRED_VEHICLE_UPLOADS.find((item) => item.type === type)?.label ?? type);
  const documentStatusLabel = (status: string) => t(DOCUMENT_STATUS_LABELS[status] ?? status);
  const preferredLanguage = profile.preferredLanguages?.[0];
  const preferredLanguageLabel = isSupportedLanguage(preferredLanguage)
    ? LANGUAGE_CONFIGS[preferredLanguage].nativeLabel : '—';
  const sections = [
    {
      title: t('Profile'),
      details: [
        `${profile.firstName} ${profile.lastName}`.trim(),
        `${t('Nickname')}: ${profile.nickname ?? '—'}`,
        `${t('Phone')}: ${profile.phone}`,
        `${t('Full name on ID')}: ${profile.fullNameOnId ?? '—'}`,
        `${t('ID or residency number')}: ${profile.idOrResidencyNumberMasked ?? '—'}`,
        `${t('Date of birth')}: ${profile.dateOfBirth?.slice(0, 10) ?? '—'}`,
        `${t('Location')}: ${[profile.city, profile.countryCode].filter(Boolean).join(', ')}`,
        `${t('Address')}: ${[profile.addressLine1, profile.addressLine2, profile.postalCode].filter(Boolean).join(', ') || '—'}`,
        `${t('Preferred Language')}: ${preferredLanguageLabel}`,
        `${t('Emergency contact')}: ${[profile.emergencyContactName, profile.emergencyContactPhone].filter(Boolean).join(', ') || '—'}`,
      ],
      ready: readiness.profile,
      route: `/complete-profile?${routeSuffix}`,
    },
    {
      title: t('Personal documents'),
      details: [
        ...documents.uploadedDocuments.map((document) =>
          `${documentLabel(document.type)}: ${documentStatusLabel(document.status)}${document.expiresAt ? ` · ${document.expiresAt.slice(0, 10)}` : ''}`,
        ),
        ...documents.missingDocumentLabels.map((label) => `${t('Missing')}: ${t(label)}`),
      ],
      ready: readiness.documents,
      route: `/vehicle-documents?${routeSuffix}`,
    },
    {
      title: t('Vehicle details'),
      details: [
        `${vehicle.brand} ${vehicle.model} (${vehicle.year})`,
        t(VEHICLE_TYPE_LABELS[vehicle.vehicleType]),
        vehicle.licensePlateNumber,
        `${t('Condition')}: ${t(VEHICLE_CONDITION_LABELS[vehicle.condition] ?? vehicle.condition)}`,
        ...((vehicle.documents ?? []).map((document) => `${documentLabel(document.type)}: ${documentStatusLabel(document.status)}`)),
        `${t('Insurance expiry date')}: ${vehicle.insuranceExpiryDate?.slice(0, 10) ?? '—'}`,
        `${t('Registration expiry date')}: ${vehicle.registrationExpiryDate?.slice(0, 10) ?? '—'}`,
      ],
      ready: readiness.vehicle,
      route: `/vehicle-information?flow=onboarding&${routeSuffix}`,
    },
    {
      title: t('Load capacity'),
      details: [
        vehicle.loadProfileName ?? '',
        vehicle.capacityKg ? `${vehicle.capacityKg} kg` : '',
        vehicle.lengthCm && vehicle.widthCm && vehicle.heightCm
          ? `${vehicle.lengthCm} × ${vehicle.widthCm} × ${vehicle.heightCm} cm` : '',
        formatCargoTypes(vehicle.allowedCargoTypes ?? []).split(', ').map((label) => t(label)).join(', '),
      ].filter(Boolean),
      ready: readiness.capacity,
      route: `/load-capacity?flow=onboarding&${routeSuffix}`,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('Check your details')}</Text>
      <Text style={styles.intro}>{t('Review these details before sending your application to admin review. Use Change to correct anything.')}</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('Change')} ${section.title}`} onPress={() => router.push(section.route as never)}>
              <Text style={styles.link}>{t('Change')}</Text>
            </Pressable>
          </View>
          {section.details.map((detail, index) => <Text key={`${index}-${detail}`} style={styles.detail}>{detail}</Text>)}
          {!section.ready && <Text style={styles.error}>{t('This section needs attention before submission.')}</Text>}
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        style={[styles.button, (!allReady || submitting) && styles.disabled]}
        disabled={!allReady || submitting}
        onPress={() => void submit()}
      >
        {submitting ? <ActivityIndicator color="#171717" /> : <Text style={styles.buttonText}>{t('Submit for Review')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8F9' },
  content: { padding: 22, paddingBottom: 50, gap: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 22 },
  title: { fontSize: 26, fontWeight: '800', color: '#171717' },
  intro: { fontSize: 14, color: '#505A6A', lineHeight: 21 },
  card: { borderRadius: 16, backgroundColor: '#fff', padding: 16, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#171717', flex: 1 },
  detail: { fontSize: 14, color: '#404A59' },
  link: { fontSize: 14, fontWeight: '700', color: '#765700' },
  error: { fontSize: 14, color: '#B42318' },
  button: { backgroundColor: '#F4B900', borderRadius: 12, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.45 },
  buttonText: { fontSize: 16, fontWeight: '800', color: '#171717' },
});
