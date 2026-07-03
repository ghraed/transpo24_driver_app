import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAdditionalExpense } from '@/services/tripService';
import type { AdditionalExpenseFormValues } from '@/types/trip.types';

type AdditionalExpenseParams = {
  requestId?: string;
};

function isPositiveAmount(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export default function AdditionalExpenseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<AdditionalExpenseParams>();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';

  const [form, setForm] = useState<AdditionalExpenseFormValues>({
    amount: '',
    reason: '',
    equipmentType: '',
    invoice: null,
  });
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationMessage = useMemo(() => {
    if (!requestId) return 'Missing request ID.';
    if (!isPositiveAmount(form.amount)) return 'Expense amount must be greater than 0.';
    if (!form.reason.trim()) return 'Expense reason is required.';
    if (!form.invoice) return 'Invoice / receipt photo is required.';
    return null;
  }, [form.amount, form.invoice, form.reason, requestId]);

  const setInvoiceFile = (asset: {
    uri: string;
    name?: string | null;
    mimeType?: string | null;
    size?: number | null;
  }): void => {
    setForm((current) => ({
      ...current,
      invoice: {
        uri: asset.uri,
        fileName: asset.name ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        fileSize: asset.size ?? undefined,
      },
    }));
  };

  const captureInvoicePhoto = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to capture an invoice or receipt photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setInvoiceFile({
      uri: asset.uri,
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.fileSize,
    });
  };

  const pickInvoicePhoto = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Photo library permission is required to choose an invoice or receipt photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setInvoiceFile({
      uri: asset.uri,
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.fileSize,
    });
  };

  const pickInvoiceFile = async (): Promise<void> => {
    setSubmitError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setInvoiceFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });
  };

  const onSubmit = async (): Promise<void> => {
    setSubmitError('');
    setSubmitSuccess('');
    if (validationMessage || !form.invoice) {
      setSubmitError(validationMessage || 'Invoice / receipt photo is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createAdditionalExpense(requestId, {
        amount: Number(form.amount),
        reason: form.reason.trim(),
        equipmentType: form.equipmentType.trim() || undefined,
        invoice: form.invoice,
      });
      setSubmitSuccess(
        `Expense submitted successfully. ${response.walletDeduction.amount.toFixed(2)} ${response.walletDeduction.currency} will be deducted from the customer wallet.`,
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit additional expense.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Additional Expenses</Text>
          <Text style={styles.subtitle}>
            Submit unexpected costs with invoice or receipt proof.
          </Text>
          <Text style={styles.helperText}>
            This amount will be deducted from the customer&apos;s wallet.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Expense amount</Text>
          <TextInput
            style={styles.input}
            value={form.amount}
            onChangeText={(value) => setForm((current) => ({ ...current, amount: value }))}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Description / category</Text>
          <TextInput
            style={styles.input}
            value={form.reason}
            onChangeText={(value) => setForm((current) => ({ ...current, reason: value }))}
            placeholder="Crane fee, parking fee, yard fee..."
          />

          <Text style={styles.label}>Equipment type (optional)</Text>
          <TextInput
            style={styles.input}
            value={form.equipmentType}
            onChangeText={(value) => setForm((current) => ({ ...current, equipmentType: value }))}
            placeholder="Crane"
          />

          <Text style={styles.label}>Invoice / Receipt photo</Text>
          <Text style={styles.helperText}>
            Take a clear photo of the receipt or upload one from your library. This is required.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void captureInvoicePhoto()}>
              <Text style={styles.secondaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void pickInvoicePhoto()}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>
          <Pressable style={styles.ghostButton} onPress={() => void pickInvoiceFile()}>
            <Text style={styles.ghostButtonText}>
              {form.invoice ? 'Replace Invoice File' : 'Choose File Instead'}
            </Text>
          </Pressable>

          {form.invoice ? (
            <View style={styles.invoiceCard}>
              {form.invoice.mimeType?.startsWith('image/') ? (
                <Image source={{ uri: form.invoice.uri }} style={styles.invoicePreview} />
              ) : null}
              <Text style={styles.fileText}>{form.invoice.fileName || 'Selected file'}</Text>
            </View>
          ) : (
            <Text style={styles.helperText}>No invoice file selected yet.</Text>
          )}
        </View>

        {validationMessage && !submitError ? <Text style={styles.errorText}>{validationMessage}</Text> : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (Boolean(validationMessage) || isSubmitting) && styles.disabledButton]}
          disabled={Boolean(validationMessage) || isSubmitting}
          onPress={() => void onSubmit()}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Submitting Expense...' : 'Submit Expense'}
          </Text>
        </Pressable>

        <Pressable style={styles.linkButton} onPress={() => router.back()}>
          <Text style={styles.linkButtonText}>Back to Active Request</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#334155',
    fontSize: 14,
  },
  label: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  ghostButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  invoiceCard: {
    gap: 8,
  },
  invoicePreview: {
    width: 132,
    height: 132,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  fileText: {
    color: '#334155',
    fontSize: 13,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  successText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  linkButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
});
