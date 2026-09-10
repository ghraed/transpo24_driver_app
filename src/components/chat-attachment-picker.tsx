import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { ChatIcon } from './chat-icon';
import { DriverIcon } from './driver-icon';
import { pickChatAttachments, sendSelectedChatAttachments } from '@/lib/request-files';
import type { ChatMessage } from '@/types/chat';

export function ChatAttachmentButton({ roomId, disabled, onSent }: {
  roomId: string; disabled?: boolean; onSent: (message: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<DocumentPickerAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const choose = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      setFiles(await pickChatAttachments());
      setError('');
    } catch (error) {
      Alert.alert(t('documents.title'), t(error instanceof Error ? error.message : 'documents.failed', { defaultValue: t('documents.failed') }));
    } finally { lock.current = false; setBusy(false); }
  };
  const send = async () => {
    if (lock.current || disabled || !files.length) return;
    lock.current = true;
    setBusy(true);
    setCompleted(0);
    setError('');
    try {
      const failed = await sendSelectedChatAttachments(roomId, files, onSent, setCompleted);
      setFiles(failed);
      if (failed.length) setError(t('documents.partialFailure', { count: failed.length }));
    } catch (error) {
      setError(t(error instanceof Error ? error.message : 'documents.failed', { defaultValue: t('documents.failed') }));
    } finally { lock.current = false; setBusy(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('documents.attach')} disabled={disabled || busy}
      style={[styles.attach, (disabled || busy) && styles.disabled]} onPress={() => void choose()}>
      {busy ? <ActivityIndicator color="#475569" /> : <ChatIcon name="attach" size={22} color="#475569" />}
    </Pressable>
    <Modal visible={files.length > 0} animationType="slide" onRequestClose={() => { if (!busy) setFiles([]); }}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('documents.selected', { count: files.length })}</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.cancel} onPress={() => setFiles([])}>
            <Text>{t('Cancel')}</Text>
          </Pressable>
        </View>
        <FlatList data={files} numColumns={2} keyExtractor={(file, index) => `${file.uri}-${index}`}
          contentContainerStyle={styles.list} columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => <View style={styles.card}>
            {item.mimeType?.startsWith('image/') || /\.(jpe?g|png)$/i.test(item.name)
              ? <Image source={{ uri: item.uri }} style={styles.preview} contentFit="cover" />
              : <View style={styles.preview}><DriverIcon name="document" size={48} color="#9A6500" /></View>}
            <Text numberOfLines={2} style={styles.fileName}>{item.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('documents.remove', { name: item.name })}
              disabled={busy} style={styles.remove} onPress={() => setFiles(current => current.filter((_, position) => position !== index))}>
              <Text style={styles.removeText}>×</Text>
            </Pressable>
          </View>}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('documents.sendSelected', { count: files.length })} disabled={busy || disabled} style={[styles.send, (busy || disabled) && styles.disabled]} onPress={() => void send()}>
          <Text style={styles.sendText}>{busy ? t('documents.sendingBatch', { completed, total: files.length }) : t('documents.sendSelected', { count: files.length })}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  attach: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, backgroundColor: '#FFFFFF' },
  title: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1E293B' },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  list: { padding: 12, gap: 12 },
  row: { gap: 12 },
  card: { flex: 1, maxWidth: '50%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  preview: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EDF2' },
  fileName: { padding: 10, fontSize: 12, color: '#475569' },
  remove: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#FFFFFF', fontSize: 28 },
  error: { color: '#B91C1C', padding: 16 },
  send: { backgroundColor: '#FFC93E', borderRadius: 24, margin: 16, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
  sendText: { color: '#263449', fontWeight: '700' },
});
