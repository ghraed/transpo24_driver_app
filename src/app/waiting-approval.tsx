import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DRIVER_ONBOARDING_STEP_LABELS, REVIEW_TIMING_MESSAGE } from '@/components/driver-onboarding-checklist';
import { useAuth } from '@/context/auth-context';
import { getDriverDocumentsStatus, getDriverVehicles } from '@/lib/api';
import { nextStepToRoute } from '@/lib/onboarding-route';
import { getRejectedReviewItems, type ReviewCorrectionItem } from '@/lib/driver-review-corrections';

export default function WaitingApprovalScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { driver, refreshDriverMe } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingReason, setIsLoadingReason] = useState(false);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [correctionItems, setCorrectionItems] = useState<ReviewCorrectionItem[]>([]);
  const [hasVehicleCorrection, setHasVehicleCorrection] = useState(false);
  const [reviewDetailsLoadFailed, setReviewDetailsLoadFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadReviewReason = useCallback(async () => {
    setIsLoadingReason(true);
    setReviewDetailsLoadFailed(false);
    const [documentsResult, vehiclesResult] = await Promise.allSettled([
      getDriverDocumentsStatus(),
      getDriverVehicles(),
    ]);

    const documentReason = documentsResult.status === 'fulfilled'
      ? documentsResult.value.uploadedDocuments.find(
          (document) => document.status === 'REJECTED' && document.rejectionReason?.trim(),
        )?.rejectionReason
      : null;
    const vehicleReason = vehiclesResult.status === 'fulfilled'
      ? vehiclesResult.value.find(
          (vehicle) => vehicle.status === 'REJECTED' && vehicle.rejectionReason?.trim(),
        )?.rejectionReason
      : null;

    const vehicles = vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [];
    setCorrectionItems(getRejectedReviewItems(
      documentsResult.status === 'fulfilled' ? documentsResult.value : null,
      vehicles,
    ));
    setHasVehicleCorrection(Boolean(vehicleReason || vehicles.some((vehicle) =>
      vehicle.documents?.some((document) => document.status === 'REJECTED'),
    )));
    setReviewReason(documentReason?.trim() || vehicleReason?.trim() || null);
    setReviewDetailsLoadFailed(documentsResult.status === 'rejected' && vehiclesResult.status === 'rejected');
    setIsLoadingReason(false);
  }, []);

  useEffect(() => {
    if (driver?.status !== 'REJECTED') return;
    const timer = setTimeout(() => void loadReviewReason(), 0);
    return () => clearTimeout(timer);
  }, [driver?.status, loadReviewReason]);

  const statusCopy = useMemo(() => {
    if (driver?.status === 'REJECTED') {
      return {
        title: t('Review Declined'),
        subtitle: t('Replace only the rejected items below, then submit again.'),
      };
    }

    if (driver?.status === 'APPROVED') {
      return {
        title: t('Approval Updated'),
        subtitle: t('Your account was approved. Refresh to continue to the next step.'),
      };
    }

    return {
      title: t('Waiting Approval'),
      subtitle: t('Your driver account is under admin review.'),
    };
  }, [driver?.status, t]);

  const handleRefreshStatus = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setErrorMessage('');

    try {
      const response = await refreshDriverMe();
      if (response.nextStep !== 'WAITING_APPROVAL') {
        router.replace(nextStepToRoute(response.nextStep));
      } else if (response.driver.status === 'REJECTED') {
        await loadReviewReason();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Failed to refresh approval status.'));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.progress}>{t(DRIVER_ONBOARDING_STEP_LABELS[5])}</Text>
          <Text style={styles.title}>{statusCopy.title}</Text>
          <Text style={styles.subtitle}>{statusCopy.subtitle}</Text>
          <Text style={styles.statusText}>{t('Current status')}: {driver?.status ?? 'PENDING_REVIEW'}</Text>
          {driver?.status !== 'REJECTED' && driver?.status !== 'APPROVED' ? (
            <Text style={styles.reviewTiming}>{t(REVIEW_TIMING_MESSAGE)}</Text>
          ) : null}

          {driver?.status === 'REJECTED' ? (
            <>
              <View style={styles.reasonCard}>
                <Text style={styles.reasonTitle}>{t('Reason for decline')}</Text>
                {isLoadingReason ? (
                  <ActivityIndicator color="#A66F00" />
                ) : (
                  correctionItems.length > 0 ? correctionItems.map((item) => (
                    <View key={item.key} style={styles.correctionItem}>
                      <Text style={styles.correctionLabel}>{t(item.label)}</Text>
                      {item.reason ? <Text style={styles.reasonText}>{item.reason}</Text> : null}
                    </View>
                  )) : (
                    <Text style={styles.reasonText}>
                      {reviewReason || t('No specific reason was provided. Review your documents and vehicle details before submitting again.')}
                    </Text>
                  )
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Fix submission')}
                onPress={() => router.replace(
                  correctionItems.some((item) => item.area === 'personal') || !hasVehicleCorrection
                    ? '/vehicle-documents'
                    : '/vehicle-information?flow=onboarding',
                )}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>{t('Fix submission')}</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Refresh status')}
            disabled={isRefreshing}
            onPress={() => void handleRefreshStatus()}
            style={({ pressed }) => [
              driver?.status === 'REJECTED' ? styles.secondaryButton : styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isRefreshing && styles.buttonDisabled,
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator color="#171717" size="small" />
            ) : (
              <Text style={driver?.status === 'REJECTED' ? styles.secondaryButtonText : styles.primaryButtonText}>
                {t('Refresh status')}
              </Text>
            )}
          </Pressable>

          {driver?.status !== 'REJECTED' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/receive-requests')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            >
              <Text style={styles.secondaryButtonText}>{t('Back to home')}</Text>
            </Pressable>
          ) : null}

          {reviewDetailsLoadFailed ? <Text accessibilityRole="alert" style={styles.errorText}>{t('Unable to load review details. Refresh to try again.')}</Text> : null}
          {errorMessage ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, flexGrow: 1 },
  card: { borderWidth: 1, borderColor: '#DFE3E8', borderRadius: 12, padding: 16, gap: 12 },
  progress: { color: '#A66F00', fontSize: 13, fontWeight: '700' },
  reviewTiming: { color: '#705000', backgroundColor: '#FFF8E5', borderRadius: 10, padding: 12, lineHeight: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#202020' },
  subtitle: { color: '#707A8C', lineHeight: 20 },
  statusText: { color: '#505A6A', fontSize: 13, fontWeight: '600' },
  reasonCard: { backgroundColor: '#FFF8E5', borderRadius: 10, padding: 14, gap: 6 },
  reasonTitle: { color: '#705000', fontSize: 14, fontWeight: '700' },
  reasonText: { color: '#3F3520', lineHeight: 20 },
  correctionItem: { paddingTop: 4, gap: 2 },
  correctionLabel: { color: '#705000', fontWeight: '700' },
  primaryButton: {
    alignItems: 'center', borderRadius: 10, backgroundColor: '#F1B900', paddingHorizontal: 16, paddingVertical: 14,
  },
  primaryButtonPressed: { opacity: 0.9 },
  secondaryButton: {
    alignItems: 'center', borderRadius: 10, borderColor: '#F3D26B', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14,
  },
  secondaryButtonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#171717', fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { color: '#A66F00', fontSize: 16, fontWeight: '700' },
  errorText: { color: '#DC2626', fontSize: 13 },
});
