import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import {
  acknowledgeDocuments,
  DOCUMENT_TYPES,
  listRequestDocuments,
  openRequestFile,
  uploadRequestDocument,
  type DocumentsState,
  type DocumentType,
} from '@/lib/request-files';

export function RequestDocuments({
  requestId,
  customer = false,
}: {
  requestId: string;
  customer?: boolean;
}) {
  const { t } = useTranslation();
  const focused = useRef(false);
  const [state, setState] = useState<DocumentsState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const load = useCallback(async () => {
    try {
      const next = await listRequestDocuments(requestId);
      if (!focused.current) return;
      setState(next);
      setError('');
      setPrompt(customer && next.shouldPrompt);
    } catch {
      if (focused.current) setError('documents.failed');
    }
  }, [requestId, customer]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void load();
      const timer = setInterval(() => {
        void load();
      }, 30000);
      return () => {
        focused.current = false;
        clearInterval(timer);
        setPrompt(false);
      };
    }, [load]),
  );
  const upload = async (type: DocumentType) => {
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadRequestDocument(requestId, type);
      if (uploaded) {
        setChoosing(false);
        setPrompt(false);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'documents.failed');
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    try {
      await acknowledgeDocuments(requestId);
      setPrompt(false);
    } catch {
      setError('documents.failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('documents.title')}</Text>
      <Text style={styles.hint}>{t('documents.private')}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(error, { defaultValue: t('documents.failed') })}
        </Text>
      ) : null}
      {!state ? (
        <Pressable onPress={() => void load()}>
          <Text style={styles.text}>{t('documents.retry')}</Text>
        </Pressable>
      ) : null}
      {state?.files.length === 0 ? (
        <Text style={styles.text}>{t('documents.empty')}</Text>
      ) : null}
      {state?.files.map((file) => (
        <Pressable
          key={file.id}
          accessibilityRole="button"
          disabled={busy}
          style={styles.file}
          onPress={() => {
            setBusy(true);
            void openRequestFile(
              `/request-files/${file.id}/content`,
              file.fileName,
            )
              .catch(() => setError('documents.failed'))
              .finally(() => setBusy(false));
          }}
        >
          <Text style={styles.label}>
            {t(`documents.type.${file.documentType}`)}
          </Text>
          <Text style={styles.text}>{file.fileName}</Text>
          <Text style={styles.hint}>
            {Math.ceil(file.size / 1024)} KB · {t('documents.open')}
          </Text>
        </Pressable>
      ))}
      {customer && state?.canUpload ? (
        <>
          <Pressable
            style={styles.button}
            disabled={busy}
            onPress={() => setChoosing(!choosing)}
          >
            <Text style={styles.buttonText}>{t('documents.add')}</Text>
          </Pressable>
          {choosing && !prompt ? (
            <View style={styles.choices}>
              <Text style={styles.hint}>{t('documents.formats')}</Text>
              {DOCUMENT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={styles.file}
                  disabled={busy}
                  onPress={() => void upload(type)}
                >
                  <Text style={styles.label}>
                    {t(`documents.type.${type}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      {busy ? <ActivityIndicator color="#111827" /> : null}
      <Modal
        visible={prompt}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) void skip();
        }}
      >
        <View style={styles.overlay}>
          <ScrollView
            style={styles.dialogScroll}
            contentContainerStyle={styles.dialog}
          >
            <Text style={styles.title}>{t('documents.question')}</Text>
            <Text style={styles.hint}>{t('documents.private')}</Text>
            {error ? (
              <Text style={styles.error}>{t('documents.failed')}</Text>
            ) : null}
            {choosing ? (
              <View style={styles.choices}>
                <Text style={styles.hint}>{t('documents.formats')}</Text>
                {DOCUMENT_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    accessibilityRole="button"
                    style={styles.file}
                    disabled={busy}
                    onPress={() => void upload(type)}
                  >
                    <Text style={styles.label}>
                      {t(`documents.type.${type}`)}
                    </Text>
                  </Pressable>
                ))}
                {busy ? <ActivityIndicator color="#111827" /> : null}
              </View>
            ) : (
              <Pressable
                style={styles.button}
                disabled={busy}
                onPress={() => setChoosing(true)}
              >
                <Text style={styles.buttonText}>{t('documents.add')}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.file}
              disabled={busy}
              onPress={() => void skip()}
            >
              <Text style={styles.label}>{t('documents.later')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E8EF',
  },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
  text: { color: '#111827', fontSize: 14 },
  label: { color: '#111827', fontWeight: '600' },
  hint: { color: '#68768A', fontSize: 13, lineHeight: 20 },
  error: { color: '#C0392B' },
  file: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    gap: 6,
  },
  button: {
    backgroundColor: '#FFC548',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#111827', fontWeight: '700' },
  choices: { gap: 10 },
  overlay: {
    flex: 1,
    backgroundColor: '#0008',
    justifyContent: 'center',
    padding: 24,
  },
  dialogScroll: { flexGrow: 0, maxHeight: '90%' },
  dialog: { backgroundColor: '#FFF', borderRadius: 22, padding: 22, gap: 18 },
});
