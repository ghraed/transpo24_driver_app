import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Colors } from '@/constants/theme';

const SELECTED_DARK_TEXT_COLOR = '#EAB308';

export default function AppTabs() {
  const scheme = useColorScheme();
  const { t } = useTranslation();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const selectedLabelColor = scheme === 'dark' ? SELECTED_DARK_TEXT_COLOR : colors.text;

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: selectedLabelColor } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('Home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>{t('Explore')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
