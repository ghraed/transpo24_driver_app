import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { downloadRequestFile, loadRequestImagePreview, openRequestFile } from '@/lib/request-files';
export { ChatAttachmentButton } from './chat-attachment-picker';
export function ChatAttachment({ url, name, metadata, tileSize, onOpen, openLabel, overlay }: { url: string; name: string; metadata?: React.ReactNode; tileSize?: number; onOpen?: () => void; openLabel?: string; overlay?: React.ReactNode }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const thumbnailWidth = tileSize ?? Math.min(280, (width - 32) * 0.8);
  const [preview, setPreview] = useState<{ url: string; uri: string } | null>(null);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewFailed = failedPreviewUrl === url;
  const isImage = /\.(png|jpe?g)$/i.test(name);
  useEffect(() => {
    let active = true;
    let cleanup: (() => unknown) | undefined;
    if (isImage) {
      void loadRequestImagePreview(url, name).then((file) => {
        if (!active) { file.cleanup(); return; }
        cleanup = file.cleanup;
        setPreview({ url, uri: file.uri });
        setFailedPreviewUrl(null);
      }).catch(() => { if (active) setFailedPreviewUrl(url); });
    }
    return () => { active = false; cleanup?.(); };
  }, [url, name, isImage]);
  const run = (download: boolean) => {
    setBusy(true);
    void (download ? downloadRequestFile(url, name) : openRequestFile(url, name))
      .then((saved) => {
        if (saved) Alert.alert(t('documents.title'), t('documents.saved'));
      })
      .catch((error) => Alert.alert(t('documents.title'), t(
        error instanceof Error ? error.message : 'documents.failed',
        { defaultValue: t('documents.failed') },
      )))
      .finally(() => setBusy(false));
  };
  const confirmDownload = () => {
    const message = t('documents.confirmDownload');
    if (Platform.OS === 'web') {
      if (window.confirm(message)) run(true);
      return;
    }
    Alert.alert(t('documents.download'), message, [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('documents.download'), onPress: () => run(true) },
    ]);
  };
  return (
    <View style={[styles.attachment, { width: thumbnailWidth, height: tileSize ?? thumbnailWidth * 0.9 }]}>
      <Pressable
        style={({ pressed }) => [styles.thumbnail, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={openLabel ?? `${t('documents.open')}: ${name}`}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={onOpen ?? (() => run(false))}
      >
        {isImage && preview?.url === url && !previewFailed ? (
          <Image
            source={{ uri: preview.uri }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            cachePolicy="none"
            recyclingKey={url}
            onError={() => setFailedPreviewUrl(url)}
          />
        ) : isImage && !previewFailed ? (
          <ActivityIndicator color="#707A8C" />
        ) : (
          <View style={styles.documentPreview}>
            <Svg width={80} height={100} viewBox="0 0 80 100">
              <Path d="M10 2 H50 L70 22 V94 Q70 98 66 98 H10 Q6 98 6 94 V6 Q6 2 10 2 Z" fill="#FFFFFF" stroke="#B8C2D0" strokeWidth={2} />
              <Path d="M50 2 V22 H70 M20 38 H56 M20 48 H56 M20 58 H45" fill="none" stroke="#B8C2D0" strokeWidth={2} />
              <Rect x={16} y={70} width={44} height={16} rx={3} fill={isImage ? '#64748B' : '#D45D53'} />
            </Svg>
            <Text style={styles.fileType}>{isImage ? 'IMG' : 'PDF'}</Text>
          </View>
        )}
        {overlay ? <View pointerEvents="none" style={styles.loadingOverlay}>{overlay}</View> : null}
        {busy ? <View style={styles.loadingOverlay}><ActivityIndicator color="#111827" /></View> : null}
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.download, busy && styles.disabled, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('documents.download')}
        disabled={busy}
        onPress={confirmDownload}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" accessible={false}>
          <Path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      {metadata ? <View pointerEvents="none" style={styles.metadata}>{metadata}</View> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  attachment: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(11, 20, 26, 0.10)',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  documentPreview: { alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', backgroundColor: '#F0F3F7', paddingBottom: 8 },
  fileType: { position: 'absolute', top: '50%', marginTop: 17, color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  loadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  download: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: 'rgba(11, 20, 26, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadata: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(11, 20, 26, 0.48)' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
