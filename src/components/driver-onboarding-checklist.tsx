import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export const DRIVER_ONBOARDING_STEP_LABELS = [
  'Step 1 of 7: Verify phone',
  'Step 2 of 7: Profile',
  'Step 3 of 7: Personal documents',
  'Step 4 of 7: Vehicle details',
  'Step 5 of 7: Load capacity',
  'Step 6 of 7: Admin review',
  'Step 7 of 7: Availability',
] as const;

export const REVIEW_TIMING_MESSAGE = 'Review times vary. Check your status in the app; you may also receive a notification when a decision is made.';

export function DriverOnboardingChecklist({ isRTL = false }: { isRTL?: boolean }) {
  const { t } = useTranslation();

  return (
    <View accessibilityLabel={t('Registration checklist')} style={styles.card}>
      <Text style={[styles.title, isRTL && styles.rtl]}>{t('Registration checklist')}</Text>
      <Text style={[styles.description, isRTL && styles.rtl]}>
        {t('Have your ID, driving licence, vehicle registration, insurance, and vehicle photos ready.')}
      </Text>
      <Text style={[styles.estimate, isRTL && styles.rtl]}>
        {t('Plan for about 15–20 minutes to fill in the forms and upload your documents and photos. Allow more time if you need to take the photos first.')}
      </Text>
      <View style={styles.steps}>
        {DRIVER_ONBOARDING_STEP_LABELS.map((label) => (
          <Text key={label} style={[styles.step, isRTL && styles.rtl]}>{t(label)}</Text>
        ))}
      </View>
      <Text style={[styles.reviewTiming, isRTL && styles.rtl]}>{t(REVIEW_TIMING_MESSAGE)}</Text>
      <Text style={[styles.description, isRTL && styles.rtl]}>
        {t('After approval, set your availability to start receiving requests.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#F3D26B', backgroundColor: '#FFF9E8', padding: 14, gap: 9, marginBottom: 18 },
  title: { color: '#202020', fontSize: 16, fontWeight: '800' },
  description: { color: '#505A6A', fontSize: 13, lineHeight: 19 },
  estimate: { color: '#705000', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  steps: { gap: 5 },
  step: { color: '#202020', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  reviewTiming: { color: '#705000', fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
