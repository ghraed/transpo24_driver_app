import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAdditionalExpense } from '@/services/tripService';
import type { AdditionalExpenseFormValues } from '@/types/trip.types';
import type { LocalDocumentAsset } from '@/types/auth';

type TripExpensesParams = {
  tripId?: string;
};

const INITIAL_FORM_VALUES: AdditionalExpenseFormValues = {
  amount: '',
  reason: '',
  equipmentType: '',
  invoicePhoto: null,
};

function toAssetFromImagePicker(asset: ImagePicker.ImagePickerAsset): LocalDocumentAsset {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    width: asset.width,
    height: asset.height,
  };
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function TripExpensesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<TripExpensesParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';

  const [formValues, setFormValues] = useState<AdditionalExpenseFormValues>(INITIAL_FORM_VALUES);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitMessage, setSubmitMessage] = useState<string>('');

  const onChangeField = (
    field: keyof AdditionalExpenseFormValues,
    value: string | LocalDocumentAsset | null,
  ): void => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const onTakeInvoicePhoto = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to capture the invoice or receipt.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onChangeField('invoicePhoto', toAssetFromImagePicker(asset));
  };

  const onChooseInvoicePhoto = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Media library permission is required to choose the invoice or receipt.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: false,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onChangeField('invoicePhoto', toAssetFromImagePicker(asset));
  };

  const onSubmit = async (): Promise<void> => {
    setSubmitError('');
    setSubmitMessage('');

    const parsedAmount = Number(formValues.amount);
    if (!tripId) {
      setSubmitError('Trip ID is missing.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitError('Expense amount must be greater than 0.');
      return;
    }
    if (!formValues.reason.trim()) {
      setSubmitError('Expense reason is required.');
      return;
    }
    if (!formValues.invoicePhoto) {
      setSubmitError('Invoice / receipt photo is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createAdditionalExpense(tripId, {
        amount: parsedAmount,
        reason: formValues.reason.trim(),
        equipmentType: formValues.equipmentType.trim() || undefined,
        invoicePhoto: formValues.invoicePhoto,
      });

      setSubmitMessage(
        `Expense submitted. ${formatMoney(
          response.walletDeduction.amount,
          response.walletDeduction.currency,
        )} will be deducted from the customer wallet.`,
      );
      setFormValues(INITIAL_FORM_VALUES);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to submit additional expense.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Additional Expenses</Text>
          <Text style={styles.helperText}>
            Submit unexpected trip costs with invoice proof. This amount will be deducted from the
            customer&apos;s wallet.
          </Text>
          <Text style={styles.metaText}>Trip ID: {tripId || 'N/A'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Expense Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={formValues.amount}
            onChangeText={(value) => onChangeField('amount', value)}
          />

          <Text style={styles.sectionTitle}>Reason</Text>
          <TextInput
            style={styles.input}
            placeholder="Crane cost, paid parking, yard fee..."
            value={formValues.reason}
            onChangeText={(value) => onChangeField('reason', value)}
            maxLength={160}
          />

          <Text style={styles.sectionTitle}>Equipment / Category (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Crane, parking, towing..."
            value={formValues.equipmentType}
            onChangeText={(value) => onChangeField('equipmentType', value)}
            maxLength={80}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invoice / Receipt Photo</Text>
          <Text style={styles.helperText}>Take a clear photo of the invoice or receipt. This is required.</Text>

          {formValues.invoicePhoto ? (
            <View style={styles.proofItem}>
              <Image
                source={{ uri: formValues.invoicePhoto.uri }}
                style={styles.proofPreview}
                resizeMode="cover"
              />
              <Text style={styles.metaText} numberOfLines={1}>
                {formValues.invoicePhoto.fileName?.trim() || 'Invoice proof'}
              </Text>
              <Pressable
                style={styles.clearButton}
                onPress={() => onChangeField('invoicePhoto', null)}
              >
                <Text style={styles.clearButtonText}>Remove Photo</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.uploadActions}>
            <Pressable style={styles.uploadButton} onPress={() => void onChooseInvoicePhoto()}>
              <Text style={styles.uploadButtonText}>Choose Image</Text>
            </Pressable>
            <Pressable style={styles.uploadButton} onPress={() => void onTakeInvoicePhoto()}>
              <Text style={styles.uploadButtonText}>Take Photo</Text>
            </Pressable>
          </View>
          <Text style={styles.walletMessage}>
            This amount will be deducted from the customer&apos;s wallet.
          </Text>
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitMessage ? <Text style={styles.successText}>{submitMessage}</Text> : null}

        <Pressable
          style={[styles.actionButton, isSubmitting && styles.disabledButton]}
          disabled={isSubmitting}
          onPress={() => void onSubmit()}
        >
          <Text style={styles.actionButtonText}>
            {isSubmitting ? 'Submitting Expense...' : 'Submit Expense'}
          </Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back to Active Trip</Text>
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
  },
  metaText: {
    color: '#334155',
    fontSize: 13,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  proofItem: {
    gap: 8,
  },
  proofPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  uploadActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  uploadButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  walletMessage: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  clearButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  clearButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
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
});
