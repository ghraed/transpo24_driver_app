import React from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
export function RequestCoverageNotice({ source }: { source?: 'GPS' | 'BASE' | 'NONE'; scheduled: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  return <Pressable onPress={() => router.push('/set-availability')}>
    <Text style={{ color: '#475467', backgroundColor: '#FFFFFF', padding: 10, borderRadius: 10, fontSize: 12, textAlign: 'center' }}>
      {t(source === 'GPS' ? 'All pickups use your current GPS location.' : 'Enable GPS and location access to receive requests.')}
    </Text>
  </Pressable>;
}
