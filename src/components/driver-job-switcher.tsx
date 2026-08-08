import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type DriverJobSwitcherProps = {
  active: 'jobs' | 'accepted';
};

export function DriverJobSwitcher({ active }: DriverJobSwitcherProps) {
  const router = useRouter();
  const isJobsActive = active === 'jobs';
  const isAcceptedActive = active === 'accepted';

  return (
    <View style={styles.container} accessibilityRole="tablist">
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: isJobsActive, disabled: isJobsActive }}
        disabled={isJobsActive}
        style={[styles.tab, isJobsActive && styles.tabActive]}
        onPress={isJobsActive ? undefined : () => router.replace('/receive-requests')}
      >
        <Text style={[styles.label, isJobsActive && styles.labelActive]}>Jobs</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: isAcceptedActive, disabled: isAcceptedActive }}
        disabled={isAcceptedActive}
        style={[styles.tab, isAcceptedActive && styles.tabActive]}
        onPress={isAcceptedActive ? undefined : () => router.replace('/accepted-jobs')}
      >
        <Text style={[styles.label, isAcceptedActive && styles.labelActive]}>Accepted Jobs</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    padding: 4,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: '#ECEFF2',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#1B1B1B',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    color: '#707A8C',
    fontSize: 14,
    fontWeight: '700',
  },
  labelActive: {
    color: '#191919',
  },
});
