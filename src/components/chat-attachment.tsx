import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { downloadRequestFile, loadRequestImagePreview, openRequestFile, sendChatAttachment } from '@/lib/request-files';
import type { ChatMessage } from '@/types/chat';
export function ChatAttachmentButton({
  roomId,
  disabled,
  onSent,
}: {
  roomId: string;
  disabled?: boolean;
  onSent: (message: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('documents.attach')}
      disabled={disabled || busy}
      style={styles.button}
      onPress={() => {
        setBusy(true);
        void sendChatAttachment(roomId)
          .then((message) => {
            if (message) onSent(message);
          })
          .catch((e) =>
            Alert.alert(
              t('documents.title'),
              t(e instanceof Error ? e.message : 'documents.failed', {
                defaultValue: t('documents.failed'),
              }),
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      {busy ? (
        <ActivityIndicator color="#111827" />
      ) : (
        <Text style={styles.text}>{t('documents.attach')}</Text>
      )}
    </Pressable>
  );
}
export function ChatAttachment({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
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
  return (
    <View>
      <Pressable
        style={styles.thumbnail}
        accessibilityRole="button"
        accessibilityLabel={`${t('documents.open')}: ${name}`}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => run(false)}
      >
        {isImage && preview?.url === url && !previewFailed ? (
          <Image
            source={{ uri: preview.uri }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="none"
            recyclingKey={url}
            onError={() => setFailedPreviewUrl(url)}
          />
        ) : isImage && !previewFailed ? (
          <ActivityIndicator color="#707A8C" />
        ) : (
          <View style={styles.documentPreview}>
            <Svg width={80} height={100} viewBox="0 0 80 100">
              <Path d="M10 2 H50 L70 22 V94 Q70 98 66 98 H10 Q6 98 6 94 V6 Q6 2 10 2 Z" fill="#FFFFFF" stroke="#94A3B8" strokeWidth={2} />
              <Path d="M50 2 V22 H70 M20 38 H56 M20 48 H56 M20 58 H45" fill="none" stroke="#94A3B8" strokeWidth={2} />
              <Rect x={16} y={70} width={44} height={16} rx={3} fill={isImage ? '#64748B' : '#C44242'} />
            </Svg>
            <Text style={styles.fileType}>{isImage ? 'IMG' : 'PDF'}</Text>
          </View>
        )}
        {busy ? <View style={styles.loadingOverlay}><ActivityIndicator color="#111827" /></View> : null}
      </Pressable>
      <Pressable style={styles.download} accessibilityRole="button" disabled={busy} onPress={() => run(true)}>
        <Text style={styles.text}>{t('documents.download')}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  thumbnail: {
    width: 200,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  documentPreview: { alignItems: 'center', justifyContent: 'center' },
  fileType: { position: 'absolute', bottom: 16, color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  loadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  download: { minHeight: 44, paddingVertical: 12, alignSelf: 'flex-start' },
  button: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFC548',
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { color: '#111827', fontWeight: '600' },
});
