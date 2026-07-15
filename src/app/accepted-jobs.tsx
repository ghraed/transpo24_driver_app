import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { isActiveAcceptedJobStatus } from '@/lib/request-status';
import { getDriverAcceptedJobs, getDriverChatRooms } from '@/lib/api';
import type { DriverAcceptedJobSummary } from '@/types/auth';
import type { ChatRoom } from '@/types/chat';

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function formatMoney(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

function formatServiceLabel(
  service: DriverAcceptedJobSummary['service'] | null | undefined,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!service) return t('Service');
  if (language.startsWith('ar') && service.nameAr?.trim()) return service.nameAr;
  return service.nameEn || service.key || t('Service');
}

export default function AcceptedJobsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const [jobs, setJobs] = useState<DriverAcceptedJobSummary[]>([]);
  const [chatRoomsByRequestId, setChatRoomsByRequestId] = useState<Record<string, ChatRoom>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadJobs = useCallback(
    async (refreshing = false): Promise<void> => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError('');
      try {
        const [response, chatRoomsResponse] = await Promise.all([
          getDriverAcceptedJobs(),
          getDriverChatRooms().catch(() => ({ rooms: [] })),
        ]);
        const activeJobs = (response.jobs ?? []).filter((job) =>
          isActiveAcceptedJobStatus(job.requestStatus),
        );
        setJobs(activeJobs);
        setChatRoomsByRequestId(
          Object.fromEntries(
            (chatRoomsResponse.rooms ?? [])
              .filter((room) => activeJobs.some((job) => job.requestId === room.transportRequestId))
              .map((room) => [room.transportRequestId, room]),
          ),
        );
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : t('Failed to load accepted jobs.');
        const normalized = message.toLowerCase();
        if (
          normalized.includes('invalid or expired token') ||
          normalized.includes('authorization') ||
          normalized.includes('unauthorized')
        ) {
          await signOut();
          router.replace('/');
          return;
        }
        setError(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [router, signOut, t],
  );

  useFocusEffect(
    useCallback(() => {
      void loadJobs();
      const pollingId = setInterval(() => {
        void loadJobs(true);
      }, 25000);

      return () => clearInterval(pollingId);
    }, [loadJobs]),
  );

  const hasJobs = useMemo(() => jobs.length > 0, [jobs]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Accepted Jobs')}</Text>
        <Text style={styles.subtitle}>{t('Jobs where the customer accepted your offer.')}</Text>
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>{t('Loading accepted jobs...')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadJobs()}>
            <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
          </Pressable>
        </View>
      ) : !hasJobs ? (
        <View style={styles.centeredState}>
          <Text style={styles.stateText}>{t('No active accepted jobs.')}</Text>
          <Text style={styles.hintText}>
            {t('Delivered and completed requests are removed from this screen.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadJobs(true)} />
          }
        >
          {jobs.map((job) => {
            const jobChatRoom = chatRoomsByRequestId[job.requestId];
            const unreadCount = typeof jobChatRoom?.unreadCount === 'number' ? jobChatRoom.unreadCount : 0;

            return (
              <Pressable
                key={job.requestId}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/accepted-job-details',
                    params: { requestId: job.requestId },
                  })
                }
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.serviceText}>{formatServiceLabel(job.service, i18n.language, t)}</Text>
                  <View style={styles.cardTopMeta}>
                    {unreadCount > 0 ? (
                      <View style={styles.chatBadge}>
                        <Text style={styles.chatBadgeText}>
                          {unreadCount > 99 ? t('99+ new') : t('{{count}} new', { count: unreadCount })}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.acceptedBadge}>
                      <Text style={styles.acceptedBadgeText}>{t('Accepted')}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.itemText}>{job.item.title || job.item.type || t('Transport item')}</Text>
                <Text style={styles.metaText}>{t('Pickup')}: {job.pickup.address || t('Address unavailable')}</Text>
                <Text style={styles.metaText}>{t('Dropoff')}: {job.dropoff.address || t('Address unavailable')}</Text>
                <Text style={styles.metaText}>
                  {job.schedule.isImmediate
                    ? t('Immediate pickup')
                    : t('Scheduled: {{value}}', { value: formatDate(job.schedule.scheduledPickupAt) })}
                </Text>
                <Text style={styles.metaText}>
                  {t('Offer')}: {formatMoney(job.acceptedOffer.price, job.acceptedOffer.currency)}
                </Text>
                <Text style={styles.metaText}>{t('Accepted at')}: {formatDate(job.acceptedAt)}</Text>

                <View style={styles.cardButton}>
                  <Text style={styles.cardButtonText}>{t('View Job')}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  cardTopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  acceptedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  acceptedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  chatBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  itemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  metaText: {
    fontSize: 13,
    color: '#334155',
  },
  cardButton: {
    marginTop: 8,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
