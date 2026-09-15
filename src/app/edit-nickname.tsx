import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';

export default function EditNicknameScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { driver, saveDriverNickname } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nickname = draft ?? driver?.nickname ?? '';

  const save = async () => {
    if (saving) return;
    const value = nickname.trim();
    if (value.length < 2 || value.length > 40) {
      setError(t('Nickname must be between 2 and 40 characters.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveDriverNickname(value);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Unable to update nickname.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('Edit nickname')}</Text>
          <Text style={styles.hint}>{t('Clients will see your nickname on offers and in chats.')}</Text>
          <Text style={styles.label}>{t('Nickname')}</Text>
          <TextInput style={styles.input} accessibilityLabel={t('Nickname')} value={nickname} onChangeText={setDraft} maxLength={40} autoCorrect={false} autoFocus editable={!saving} returnKeyType="done" onSubmitEditing={() => void save()} />
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Pressable style={[styles.button, saving && styles.disabled]} accessibilityRole="button" disabled={saving} onPress={() => void save()}>
            {saving ? <ActivityIndicator color="#111827" /> : <Text style={styles.buttonText}>{t('Save Changes')}</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { padding: 24, gap: 12 },
  title: { color: '#111827', fontSize: 26, fontWeight: '800' },
  hint: { color: '#68768A', fontSize: 15, lineHeight: 22 },
  label: { color: '#374151', fontSize: 14, fontWeight: '700', marginTop: 12 },
  input: { backgroundColor: '#FFFFFF', color: '#111827', borderColor: '#E5E7EB', borderWidth: 1, borderRadius: 16, minHeight: 56, paddingHorizontal: 16, fontSize: 17 },
  error: { color: '#C62828' },
  button: { backgroundColor: '#FFC515', borderRadius: 16, minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  buttonText: { color: '#111827', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
