import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverBottomNav, DRIVER_BOTTOM_NAV_HEIGHT } from '@/components/driver-bottom-nav';
import { DriverIcon, type DriverIconName } from '@/components/driver-icon';
import { useAuth } from '@/context/auth-context';
import { getDriverDocumentsStatus, getDriverEarningsSummary, getDriverVehicles } from '@/lib/api';
import type { DocumentStatus, DriverDocument, DriverEarningsSummary } from '@/types/auth';

type VerificationState = 'verified' | 'pending';

type MenuItem = {
  label: string;
  icon: DriverIconName;
  onPress?: () => void;
};

const VERIFIED_STATUSES = new Set<DocumentStatus>(['APPROVED']);

function initials(firstName?: string | null, lastName?: string | null): string {
  const value = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.trim();
  return value.toUpperCase() || 'DR';
}

function isApproved(documents: DriverDocument[], types: DriverDocument['type'][]): boolean {
  return documents.some((document) => types.includes(document.type) && VERIFIED_STATUSES.has(document.status));
}

function formatJoinedDate(value: string | null | undefined): string {
  if (!value) return 'Member';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Member';
  return `Member since ${date.toLocaleDateString('en', { month: 'short', year: 'numeric' })}`;
}

function money(amount: number | undefined): string {
  return Math.round(amount ?? 0).toLocaleString('en-US');
}

export default function DriverProfileScreen() {
  const router = useRouter();
  const { deleteAccount, driver, signOut } = useAuth();
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const loadProfileStats = useCallback(async () => {
    setIsLoading(true);
    const [earningsResult, onboardingDocumentsResult, vehiclesResult] = await Promise.allSettled([
      getDriverEarningsSummary(),
      getDriverDocumentsStatus(),
      getDriverVehicles(),
    ]);

    if (earningsResult.status === 'fulfilled') setSummary(earningsResult.value);

    const loadedDocuments: DriverDocument[] = [];
    if (onboardingDocumentsResult.status === 'fulfilled') {
      loadedDocuments.push(...onboardingDocumentsResult.value.uploadedDocuments.map((document) => ({
        ...document,
        vehicleId: null,
        createdAt: document.uploadedAt,
      })));
    }
    if (vehiclesResult.status === 'fulfilled') {
      loadedDocuments.push(...vehiclesResult.value.flatMap((vehicle) => vehicle.documents ?? []));
    }
    setDocuments(loadedDocuments);
    setIsLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadProfileStats();
  }, [loadProfileStats]));

  const verificationRows = useMemo<{ label: string; state: VerificationState }[]>(() => [
    {
      label: 'Identity',
      state: isApproved(documents, ['ID_FRONT', 'ID_BACK', 'IDENTITY_DOCUMENT', 'PASSPORT']) ? 'verified' : 'pending',
    },
    {
      label: "Driver's License",
      state: isApproved(documents, ['DRIVING_LICENSE', 'DRIVER_LICENSE_FRONT', 'DRIVER_LICENSE_BACK']) ? 'verified' : 'pending',
    },
    {
      label: 'Vehicle Registration',
      state: isApproved(documents, ['VEHICLE_REGISTRATION', 'VEHICLE_REGISTRATION_FRONT', 'VEHICLE_REGISTRATION_BACK']) ? 'verified' : 'pending',
    },
    {
      label: 'Insurance',
      state: isApproved(documents, ['VEHICLE_INSURANCE', 'VEHICLE_INSURANCE_DOCUMENT']) ? 'verified' : 'pending',
    },
  ], [documents]);

  const menuItems: MenuItem[] = [
    { label: 'My Vehicle', icon: 'truck', onPress: () => router.push('/my-vehicles') },
    { label: 'Documents', icon: 'document', onPress: () => router.push('/vehicle-documents') },
    { label: 'Earnings History', icon: 'money', onPress: () => router.push('/earnings-history') },
    { label: 'Availability Schedule', icon: 'calendar', onPress: () => router.push('/set-availability') },
    { label: 'Settings', icon: 'settings', onPress: () => router.push('/driver-home') },
    { label: 'Help & Support', icon: 'help' },
  ];

  const rating = summary?.averageRating ?? 0;
  const fullName = `${driver?.firstName ?? ''} ${driver?.lastName ?? ''}`.trim() || 'Driver';


  const onDeleteAccount = (): void => {
    if (isDeletingAccount) return;
    Alert.alert('Delete account?', 'This permanently deletes your profile and documents, signs you out on all devices, and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => {
          setIsDeletingAccount(true);
          void deleteAccount()
            .then(() => router.replace('/'))
            .catch((error) => Alert.alert('Unable to delete account', error instanceof Error ? error.message : 'Please try again.'))
            .finally(() => setIsDeletingAccount(false));
        },
      },
    ]);
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" hitSlop={12} onPress={() => router.back()}>
          <DriverIcon name="arrow-back" size={29} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable accessibilityLabel="Open settings" hitSlop={12} onPress={() => router.push('/driver-home')}>
          <DriverIcon name="settings" size={29} strokeWidth={1.9} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.identityCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(driver?.firstName, driver?.lastName)}</Text>
            </View>
            <View style={styles.avatarBadge}>
              <DriverIcon name="star" size={14} color="#171717" fill="#171717" strokeWidth={1.5} />
            </View>
          </View>

          <Text style={styles.name}>{fullName}</Text>
          <View style={styles.memberRow}>
            <DriverIcon name="star" size={18} color="#EAAF00" fill="#EAAF00" />
            <Text style={styles.ratingText}>{rating > 0 ? rating.toFixed(1) : '—'}</Text>
            <Text style={styles.memberText}>· {formatJoinedDate(driver?.createdAt)}</Text>
          </View>
          <Pressable style={styles.editButton} onPress={() => router.push('/complete-profile')}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{summary?.completedTripsCount ?? 0}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.gold]}>{rating > 0 ? rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.currency}>{summary?.currency || 'CHF'}</Text>
            <Text style={styles.statValue}>{money(summary?.totalNet)}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
        </View>

        <View style={styles.verificationCard}>
          <Text style={styles.sectionTitle}>Verification Status</Text>
          {verificationRows.map((row) => {
            const verified = row.state === 'verified';
            return (
              <View key={row.label} style={styles.verificationRow}>
                <Text style={styles.verificationLabel}>{row.label}</Text>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#F0AF00" />
                ) : (
                  <View style={styles.statusRow}>
                    <DriverIcon
                      name={verified ? 'check' : 'clock'}
                      size={21}
                      color={verified ? '#16C653' : '#EFB000'}
                      strokeWidth={1.7}
                    />
                    <Text style={[styles.statusText, verified ? styles.verified : styles.pending]}>
                      {verified ? 'Verified' : 'Pending'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.label}
              disabled={!item.onPress}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.menuRow,
                index < menuItems.length - 1 && styles.menuDivider,
                pressed && styles.menuPressed,
              ]}
            >
              <DriverIcon name={item.icon} size={27} color="#727C8D" strokeWidth={1.8} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <DriverIcon name="chevron-right" size={23} color="#9CA6B5" strokeWidth={1.8} />
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.logoutButton}
          onPress={() => void signOut().then(() => router.replace('/'))}
        >
          <DriverIcon name="logout" size={24} color="#FF3535" strokeWidth={1.8} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAccountButton}
          onPress={onDeleteAccount}
          disabled={isDeletingAccount}
        >
          {isDeletingAccount ? (
            <ActivityIndicator color="#C82424" />
          ) : (
            <Text style={styles.deleteAccountText}>Delete account</Text>
          )}
        </Pressable>
      </ScrollView>

      <DriverBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F9' },
  header: {
    height: 72,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#171717', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  content: {
    paddingHorizontal: 22,
    paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT + 30,
  },
  identityCard: {
    minHeight: 282,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  avatarWrap: { width: 110, height: 110 },
  avatar: {
    width: 98,
    height: 98,
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDB000',
    shadowColor: '#222222',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  avatarText: { color: '#FFFFFF', fontSize: 31, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute',
    right: 3,
    bottom: 7,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  name: { marginTop: 4, color: '#1B1B1B', fontSize: 23, lineHeight: 29, fontWeight: '800' },
  memberRow: { marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { color: '#202020', fontSize: 16, fontWeight: '800' },
  memberText: { color: '#707A8C', fontSize: 14 },
  editButton: {
    minWidth: 128,
    minHeight: 48,
    marginTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  editButtonText: { color: '#252525', fontSize: 16 },
  statsRow: { marginTop: 16, flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  statValue: { color: '#202020', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  gold: { color: '#EAB000' },
  currency: { color: '#202020', fontSize: 19, lineHeight: 23, fontWeight: '800' },
  statLabel: { marginTop: 5, color: '#707A8C', fontSize: 13 },
  verificationCard: {
    marginTop: 30,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 19,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  sectionTitle: { marginBottom: 15, color: '#202020', fontSize: 18, lineHeight: 23, fontWeight: '800' },
  verificationRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verificationLabel: { flex: 1, color: '#242424', fontSize: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 14 },
  verified: { color: '#16C653' },
  pending: { color: '#EFB000' },
  menuCard: {
    marginTop: 30,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  menuRow: {
    minHeight: 64,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9DEE5' },
  menuPressed: { backgroundColor: '#F6F7F8' },
  menuLabel: { flex: 1, marginLeft: 17, color: '#242424', fontSize: 16 },
  logoutButton: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoutText: { color: '#FF3535', fontSize: 16 },
  deleteAccountButton: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAccountText: { color: '#C82424', fontSize: 14, textDecorationLine: 'underline' },
});
