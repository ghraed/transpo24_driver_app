import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { openRequestFile, sendChatAttachment } from '@/lib/request-files';
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
  return (
    <Pressable
      style={styles.button}
      accessibilityRole="button"
      disabled={busy}
      onPress={() => {
        setBusy(true);
        void openRequestFile(url, name)
          .catch(() => Alert.alert(t('documents.title'), t('documents.failed')))
          .finally(() => setBusy(false));
      }}
    >
      <Text style={styles.text}>
        {busy ? t('documents.loading') : t('documents.open')} · {name}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFC548',
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  text: { color: '#111827', fontWeight: '600' },
});
