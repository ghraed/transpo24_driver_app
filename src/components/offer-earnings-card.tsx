import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/localization/format';

type EarningsPreview = { price: number; platformFee: number; netAmount: number };

export function OfferEarningsCard({ preview, currency, platformFeePercentage }: {
  preview: EarningsPreview | null;
  currency: string;
  platformFeePercentage: number;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir?.() === 'rtl';
  const rowDirection = rtl && styles.rtlRow;
  const textDirection = rtl && styles.rtlText;
  return (
    <View style={styles.card}>
      <View style={[styles.header, rowDirection]}>
        <View style={styles.icon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'banknote', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={20} tintColor="#176747" />
        </View>
        <Text accessibilityRole="header" style={[styles.title, textDirection]}>{t('Your earnings')}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{t('Estimate')}</Text></View>
      </View>

      <View style={styles.total}>
        <Text style={[styles.totalLabel, textDirection]}>{t('Before Stripe fees')}</Text>
        <Text style={[styles.amount, rtl && styles.amountRtl]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {preview ? formatCurrency(preview.netAmount, currency) : '—'}
        </Text>
        {!preview ? <Text style={[styles.emptyHint, textDirection]}>{t('Enter a price to preview your earnings.')}</Text> : null}
      </View>

      <View style={styles.breakdown}>
        <View style={[styles.row, rowDirection]}>
          <Text style={[styles.label, textDirection]}>{t('Your offer')}</Text>
          <Text style={styles.value}>{preview ? formatCurrency(preview.price, currency) : '—'}</Text>
        </View>
        <View style={[styles.row, rowDirection]}>
          <Text style={[styles.label, textDirection]}>{t('Platform fee ({{percentage}}%)', { percentage: platformFeePercentage })}</Text>
          <Text style={styles.value}>{preview ? `−${formatCurrency(preview.platformFee, currency)}` : '—'}</Text>
        </View>
      </View>

      <View style={[styles.notice, rowDirection]}>
        <View style={styles.noticeIcon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'info.circle', android: 'info', web: 'info' }} size={18} tintColor="#825619" />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={[styles.noticeTitle, textDirection]}>{t('Stripe fees are your responsibility.')}</Text>
          <Text style={[styles.noticeBody, textDirection]}>
            {t('Stripe payment-processing fees are additional and are not included in this estimate. The actual fee depends on the transaction.')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#DDE9E1', borderRadius: 22, backgroundColor: '#FFFFFF', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF6EF', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 90, fontSize: 16, lineHeight: 22, fontWeight: '700', color: '#17212F' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#F3F5F8' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#5B6778' },
  total: { marginTop: 22, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E4E9EF' },
  totalLabel: { color: '#5B6778', fontSize: 13, lineHeight: 19 },
  amount: { marginTop: 6, color: '#176747', fontSize: 34, lineHeight: 44, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  amountRtl: { textAlign: 'right' },
  emptyHint: { marginTop: 4, fontSize: 13, lineHeight: 19, color: '#5B6778' },
  breakdown: { paddingVertical: 18, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  label: { flex: 1, color: '#5B6778', fontSize: 13, lineHeight: 20 },
  value: { maxWidth: '50%', color: '#17212F', fontSize: 14, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#FFF6E4', borderWidth: 1, borderColor: '#F2E1BC' },
  noticeIcon: { marginTop: 1 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: '#704A15', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  noticeBody: { marginTop: 5, color: '#765D38', fontSize: 12, lineHeight: 18 },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
