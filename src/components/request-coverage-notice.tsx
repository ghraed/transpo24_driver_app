import React from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
export function RequestCoverageNotice({ source, scheduled }: { source?: 'GPS' | 'BASE' | 'NONE'; scheduled: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  return <Pressable onPress={() => router.push('/set-availability')}>
    <Text style={{ color: '#475467', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, fontSize: 12, textAlign: 'center' }}>
      {t(scheduled ? 'Scheduled pickups use your saved city coverage. Tap to edit.' : source === 'GPS' ? 'Nearby pickups use your current GPS location.' : source === 'BASE' ? 'GPS unavailable: pickups use your saved base. Tap to edit.' : 'Set a base location or enable GPS to find nearby pickups.')}
    </Text>
  </Pressable>;
}
