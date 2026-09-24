import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { fetchMarkets, getSelectedMarket, saveSelectedMarket, type PublicMarket } from '@/lib/markets';

export function MarketSelector({ value, onChange, disabled }: {
  value: string; onChange: (code: string) => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const [markets, setMarkets] = useState<PublicMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([fetchMarkets(), getSelectedMarket()]).then(([items, saved]) => {
      if (!active) return;
      setMarkets(items);
      onChange(items.some((item) => item.code === saved) ? saved! : '');
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, onChange]);
  const selected = markets.find((market) => market.code === value);
  return <View style={{ marginBottom: 16, gap: 8 }}>
    <Text style={{ fontWeight: '700' }}>{t('Home market')}</Text>
    {loading ? <ActivityIndicator /> : error ? <Pressable onPress={() => { setLoading(true); setError(false); setAttempt(attempt + 1); }} accessibilityRole="button">
      <Text accessibilityRole="alert">{t('Unable to load markets. Tap to retry.')}</Text>
    </Pressable> : <Pressable disabled={disabled} onPress={() => setVisible(true)} accessibilityRole="button" style={{ padding: 12, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12 }}>
      <Text>{selected ? `${selected.name} (${selected.code})` : t('Choose your market')}</Text>
    </Pressable>}
    <Modal visible={visible} onRequestClose={() => setVisible(false)} animationType="slide">
      <SafeAreaView style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 16 }}>{t('Choose your market')}</Text>
        <Text>{t('Choose the market your account belongs to. Operational coverage is approved separately.')}</Text>
        <ScrollView style={{ marginTop: 16 }}>
          {!markets.length && <Text>{t('No markets are currently available.')}</Text>}
          {markets.map((market) => <Pressable key={market.code} accessibilityLabel={`${market.name} (${market.code})`} accessibilityRole="button" accessibilityState={{ selected: market.code === value }} style={{ paddingVertical: 18 }} onPress={() => {
            void saveSelectedMarket(market.code).then(() => { onChange(market.code); setVisible(false); }).catch(() => { setVisible(false); setError(true); });
          }}><Text>{market.name} ({market.code}) {market.code === value ? '✓' : ''}</Text></Pressable>)}
        </ScrollView>
        <Pressable onPress={() => setVisible(false)} accessibilityRole="button" style={{ paddingVertical: 16 }}><Text>{t('Close')}</Text></Pressable>
      </SafeAreaView>
    </Modal>
  </View>;
}
