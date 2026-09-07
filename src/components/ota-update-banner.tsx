import * as Updates from 'expo-updates';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function OtaUpdateBanner() {
  // Release builds only: Expo Go and development builds cannot apply OTA updates.
  if (__DEV__ || !Updates.isEnabled) return null;
  return <EnabledUpdateBanner />;
}

function EnabledUpdateBanner() {
  const { t } = useTranslation();
  const {
    currentlyRunning, isChecking, isDownloading, downloadProgress,
    isUpdatePending, isRestarting, checkError, downloadError,
  } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartFailed, setRestartFailed] = useState(false);
  const busy = restarting || isRestarting;
  const progress = typeof downloadProgress === 'number' && Number.isFinite(downloadProgress)
    ? Math.round(Math.max(0, Math.min(1, downloadProgress)) * 100)
    : undefined;
  const runningDownloadedUpdate = !currentlyRunning.isEmbeddedLaunch &&
    !currentlyRunning.isEmergencyLaunch && Boolean(currentlyRunning.updateId);

  async function restart() {
    if (busy) return;
    setRestartFailed(false);
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
      setRestartFailed(true);
    }
  }

  let message: string;
  if (busy) message = t('Restarting to apply update…');
  else if (isDownloading) message = progress === undefined
    ? t('Downloading update…') : t('Downloading update… {{percent}}%', { percent: progress });
  else if (isUpdatePending) message = restartFailed
    ? t('Could not restart. Close and reopen the app to apply the update.')
    : t('Update ready. Restart when convenient to apply it.');
  else if (isChecking) message = t('Checking for updates…');
  else if (dismissed) return null;
  else if (currentlyRunning.isEmergencyLaunch) message = t('Update could not start. Using the previous app version.');
  else if (checkError || downloadError) message = t('Update unavailable. We’ll try again next time you open the app.');
  else if (runningDownloadedUpdate) message = t('Update applied. You’re running the downloaded version.');
  else return null;

  const active = busy || isDownloading || isChecking || isUpdatePending;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {(busy || isChecking || (isDownloading && progress === undefined)) && (
          <ActivityIndicator size="small" color="#1769AA" />
        )}
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {isUpdatePending && !busy && (
          <Pressable accessibilityRole="button" onPress={() => void restart()} style={styles.button}>
            <Text style={styles.action}>{t('Restart now')}</Text>
          </Pressable>
        )}
        {!active && (
          <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} style={styles.button}>
            <Text style={styles.action}>{t('Dismiss')}</Text>
          </Pressable>
        )}
      </View>
      {(isDownloading || isUpdatePending) && (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('Update download')}
          accessibilityValue={progress === undefined && !isUpdatePending
            ? undefined : { min: 0, max: 100, now: isUpdatePending ? 100 : progress }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${isUpdatePending ? 100 : progress ?? 0}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#EAF4FF', paddingHorizontal: 12, paddingVertical: 6, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { flex: 1, color: '#143655', fontSize: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  action: { color: '#1769AA', fontSize: 12, fontWeight: '700' },
  track: { height: 3, backgroundColor: '#C5DCF2', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#208AEF' },
});
