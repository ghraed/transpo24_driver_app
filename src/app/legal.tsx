import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/content/legal';

type LegalDocument = 'privacy' | 'terms';

function resolveDocument(value: string | string[] | undefined): LegalDocument {
  return value === 'privacy' ? 'privacy' : 'terms';
}

export default function LegalScreen() {
  const router = useRouter();
  const { document } = useLocalSearchParams<{ document?: string | string[] }>();
  const activeDocument = resolveDocument(document);
  const isTerms = activeDocument === 'terms';
  const title = isTerms ? 'Terms & Conditions' : 'Privacy Policy';
  const content = isTerms ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const otherDocument: LegalDocument = isTerms ? 'privacy' : 'terms';
  const otherLabel = isTerms ? 'Privacy Policy' : 'Terms & Conditions';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.documentCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.copy}>{content}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.switchButton}
          onPress={() => router.replace({ pathname: '/legal', params: { document: otherDocument } } as never)}
        >
          <Text style={styles.switchButtonText}>Read the {otherLabel}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8F9' },
  content: { padding: 20, gap: 16 },
  documentCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  title: { color: '#171717', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  copy: { color: '#374151', fontSize: 15, lineHeight: 24 },
  switchButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1A52A',
    borderRadius: 16,
    backgroundColor: '#FFF9E8',
  },
  switchButtonText: { color: '#8A5B00', fontSize: 15, fontWeight: '800' },
});
