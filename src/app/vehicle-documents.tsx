import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import ExpoDateTimePicker from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getDriverDocumentsStatus,
  submitDriverDocumentsForReview,
  uploadDriverDocument,
} from '@/lib/api';
import { getDriverRouteForNextStep, normalizeDriverNextStep } from '@/lib/driver-onboarding';
import type {
  DriverDocumentType,
  DriverDocumentsState,
  DriverDocumentsStatusResponse,
  DriverOnboardingDocument,
  LocalDocumentAsset,
} from '@/types/auth';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DOCUMENT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function toDateOnly(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  return isoDate.slice(0, 10);
}

function toAssetFromDocumentPicker(
  asset: DocumentPicker.DocumentPickerAsset,
): LocalDocumentAsset {
  return {
    uri: asset.uri,
    fileName: asset.name,
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.size ?? undefined,
  };
}

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

export default function VehicleDocumentsScreen() {
  const router = useRouter();

  const [onboardingDocumentsForm, setOnboardingDocumentsForm] = useState<DriverDocumentsState>({
    idDocumentKind: '',
    idExpiryDate: '',
    drivingLicenseExpiryDate: '',
  });
  const [documentsStatus, setDocumentsStatus] = useState<DriverDocumentsStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeOnboardingUploadType, setActiveOnboardingUploadType] =
    useState<DriverDocumentType | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [isIdentityExpiryPickerVisible, setIsIdentityExpiryPickerVisible] =
    useState<boolean>(false);
  const [isDrivingLicenseExpiryPickerVisible, setIsDrivingLicenseExpiryPickerVisible] =
    useState<boolean>(false);

  const isBusy = Boolean(activeOnboardingUploadType) || isSubmittingReview;

  const loadDocumentsStatus = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const status = await getDriverDocumentsStatus();
      const nextStep = normalizeDriverNextStep(status.nextStep);
      if (nextStep !== 'UPLOAD_DOCUMENTS') {
        router.replace(getDriverRouteForNextStep(nextStep));
        return;
      }
      setDocumentsStatus(status);
      setOnboardingDocumentsForm((prev) => ({
        ...prev,
        idDocumentKind: status.identityDocumentKind ?? prev.idDocumentKind,
        idExpiryDate:
          prev.idExpiryDate ||
          toDateOnly(
            status.uploadedDocuments.find((document) => document.type === 'ID_FRONT')?.expiresAt ??
              status.uploadedDocuments.find((document) => document.type === 'ID_BACK')?.expiresAt ??
              null,
          ),
        drivingLicenseExpiryDate:
          prev.drivingLicenseExpiryDate ||
          toDateOnly(
            status.uploadedDocuments.find((document) => document.type === 'DRIVING_LICENSE')
              ?.expiresAt ?? null,
          ),
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load document status.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadDocumentsStatus();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadDocumentsStatus]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const normalizedMissing = new Set(documentsStatus?.missingDocuments ?? []);

    const validateOnboardingImage = (
      asset: LocalDocumentAsset | undefined,
      existingType: DriverDocumentType,
      fieldKey: string,
      label: string,
    ): void => {
      if (!asset) {
        if (normalizedMissing.has(existingType)) {
          errors[fieldKey] = `${label} is required.`;
        }
        return;
      }

      const mime = asset.mimeType ?? '';
      if (!PHOTO_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = `${label} must be JPEG, PNG, or WEBP.`;
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        errors[fieldKey] = `${label} must be 5 MB or smaller.`;
      }
    };

    validateOnboardingImage(
      onboardingDocumentsForm.personalSelfie,
      'PERSONAL_SELFIE',
      'personalSelfie',
      'Personal selfie',
    );
    validateOnboardingImage(
      onboardingDocumentsForm.idFront,
      'ID_FRONT',
      'idFront',
      'ID or residency front photo',
    );
    validateOnboardingImage(
      onboardingDocumentsForm.idBack,
      'ID_BACK',
      'idBack',
      'ID or residency back photo',
    );

    if (
      (normalizedMissing.has('ID_FRONT') || normalizedMissing.has('ID_BACK')) &&
      !onboardingDocumentsForm.idDocumentKind
    ) {
      errors.idDocumentKind = 'Choose whether you have a national ID or residency card.';
    }

    const drivingLicenseAsset = onboardingDocumentsForm.drivingLicense;
    if (!drivingLicenseAsset && normalizedMissing.has('DRIVING_LICENSE')) {
      errors.drivingLicense = 'Driving license photo is required.';
    } else if (drivingLicenseAsset) {
      const mime = drivingLicenseAsset.mimeType ?? '';
      if (!DOCUMENT_ALLOWED_TYPES.has(mime)) {
        errors.drivingLicense = 'Driving license must be PDF, JPEG, PNG, or WEBP.';
      } else if (mime === 'application/pdf') {
        if (drivingLicenseAsset.fileSize && drivingLicenseAsset.fileSize > MAX_PDF_BYTES) {
          errors.drivingLicense = 'Driving license PDF must be 10 MB or smaller.';
        }
      } else if (
        drivingLicenseAsset.fileSize &&
        drivingLicenseAsset.fileSize > MAX_IMAGE_BYTES
      ) {
        errors.drivingLicense = 'Driving license image must be 5 MB or smaller.';
      }
    }

    const validateExpiryDate = (value: string, fieldKey: string, label: string): void => {
      if (!value.trim()) return;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        errors[fieldKey] = `${label} must be a valid date.`;
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsed.setHours(0, 0, 0, 0);
      if (parsed.getTime() < today.getTime()) {
        errors[fieldKey] = `${label} must not be in the past.`;
      }
    };

    if (onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD') {
      if (!onboardingDocumentsForm.idExpiryDate.trim()) {
        errors.idExpiryDate = 'Residency expiry date is required.';
      } else {
        validateExpiryDate(
          onboardingDocumentsForm.idExpiryDate,
          'idExpiryDate',
          'Residency expiry date',
        );
      }
    }

    validateExpiryDate(
      onboardingDocumentsForm.drivingLicenseExpiryDate,
      'drivingLicenseExpiryDate',
      'Driving license expiry date',
    );

    return errors;
  }, [documentsStatus, onboardingDocumentsForm]);

  const canSubmitOnboardingReview = Boolean(documentsStatus?.canSubmitForReview) && !isBusy;

  const onOnboardingDocumentChange = <K extends keyof DriverDocumentsState>(
    key: K,
    value: DriverDocumentsState[K],
  ): void => {
    setOnboardingDocumentsForm((prev) => {
      if (key === 'idDocumentKind') {
        const nextKind = value as DriverDocumentsState['idDocumentKind'];
        return {
          ...prev,
          idDocumentKind: nextKind,
          idExpiryDate: nextKind === 'RESIDENCY_CARD' ? prev.idExpiryDate : '',
        };
      }

      return { ...prev, [key]: value };
    });
  };

  const setOnboardingDocument = (
    key: Exclude<
      keyof DriverDocumentsState,
      'idExpiryDate' | 'drivingLicenseExpiryDate'
    >,
    value?: LocalDocumentAsset,
  ): void => {
    setOnboardingDocumentsForm((prev) => ({ ...prev, [key]: value }));
  };

  const pickOnboardingDocument = async (
    key: Exclude<
      keyof DriverDocumentsState,
      'idExpiryDate' | 'drivingLicenseExpiryDate'
    >,
    type: 'image' | 'document' = 'image',
  ): Promise<void> => {
    if (activeOnboardingUploadType) return;

    if (type === 'image') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setSubmitError('Media library permission is required to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setOnboardingDocument(key, toAssetFromImagePicker(asset));
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setOnboardingDocument(key, toAssetFromDocumentPicker(asset));
  };

  const captureOnboardingDocument = async (
    key: Exclude<
      keyof DriverDocumentsState,
      'idExpiryDate' | 'drivingLicenseExpiryDate'
    >,
  ): Promise<void> => {
    if (activeOnboardingUploadType) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to capture document photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      cameraType: ImagePicker.CameraType.front,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setOnboardingDocument(key, toAssetFromImagePicker(asset));
  };

  const getUploadedOnboardingDocument = useCallback(
    (type: DriverDocumentType): DriverOnboardingDocument | undefined =>
      documentsStatus?.uploadedDocuments.find((document) => document.type === type),
    [documentsStatus],
  );

  const uploadSelectedOnboardingDocument = async (
    documentType:
      | 'PERSONAL_SELFIE'
      | 'ID_FRONT'
      | 'ID_BACK'
      | 'DRIVING_LICENSE'
      | 'SELF_IDENTITY_VERIFICATION',
  ): Promise<void> => {
    if (activeOnboardingUploadType) return;
    setSubmitError('');
    setSubmitSuccess('');

    const asset =
      documentType === 'PERSONAL_SELFIE'
        ? onboardingDocumentsForm.personalSelfie
        : documentType === 'ID_FRONT'
          ? onboardingDocumentsForm.idFront
          : documentType === 'ID_BACK'
            ? onboardingDocumentsForm.idBack
            : documentType === 'DRIVING_LICENSE'
              ? onboardingDocumentsForm.drivingLicense
              : onboardingDocumentsForm.selfIdentityVerification;

    if (!asset) {
      setSubmitError(`Select a file for ${documentType} first.`);
      return;
    }

    const expiryDate =
      documentType === 'ID_FRONT' || documentType === 'ID_BACK'
        ? onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD'
          ? onboardingDocumentsForm.idExpiryDate.trim() || undefined
          : undefined
        : documentType === 'DRIVING_LICENSE'
          ? onboardingDocumentsForm.drivingLicenseExpiryDate.trim() || undefined
          : undefined;

    setActiveOnboardingUploadType(documentType);
    try {
      const status = await uploadDriverDocument({
        documentType,
        file: asset,
        expiryDate,
        idDocumentKind:
          documentType === 'ID_FRONT' || documentType === 'ID_BACK'
            ? onboardingDocumentsForm.idDocumentKind || undefined
            : undefined,
      });
      setDocumentsStatus(status);
      setSubmitSuccess('Document uploaded successfully.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to upload document.');
    } finally {
      setActiveOnboardingUploadType(null);
    }
  };

  const onSubmitForReview = async (): Promise<void> => {
    if (!canSubmitOnboardingReview || isSubmittingReview) return;

    setSubmitError('');
    setSubmitSuccess('');
    setIsSubmittingReview(true);

    try {
      const status = await submitDriverDocumentsForReview();
      setDocumentsStatus(status);
      setSubmitSuccess('Your documents were submitted for review.');
      router.replace('/waiting-approval');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to submit documents for review.',
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading document setup...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadDocumentsStatus()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.progress}>Step 2 of 3: Documents</Text>
          <Text style={styles.title}>Required Documents</Text>
          <Text style={styles.subtitle}>
            Upload the documents below before your account can be approved.
          </Text>
          <Text style={styles.helper}>
            Clear, readable documents help us review your driver account faster.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity Verification Documents</Text>
          <Text style={styles.helper}>
            Upload the required personal documents before submitting your account for review.
          </Text>

          {renderOnboardingDocumentPicker(
            'Recent personal photo *',
            'Take a selfie in front of a white background with good lighting and a clear face.',
            'PERSONAL_SELFIE',
            onboardingDocumentsForm.personalSelfie,
            getUploadedOnboardingDocument('PERSONAL_SELFIE'),
            () => void pickOnboardingDocument('personalSelfie', 'image'),
            () => void captureOnboardingDocument('personalSelfie'),
          )}
          {fieldErrors.personalSelfie ? (
            <Text style={styles.errorText}>{fieldErrors.personalSelfie}</Text>
          ) : null}

          {renderOnboardingDocumentPicker(
            'ID / Residency front side *',
            'Upload clear front and back photos. The document must be valid and not expired.',
            'ID_FRONT',
            onboardingDocumentsForm.idFront,
            getUploadedOnboardingDocument('ID_FRONT'),
            () => void pickOnboardingDocument('idFront', 'image'),
            () => void captureOnboardingDocument('idFront'),
          )}
          {fieldErrors.idFront ? <Text style={styles.errorText}>{fieldErrors.idFront}</Text> : null}

          <Text style={styles.fieldLabel}>Document type *</Text>
          <View style={styles.optionWrap}>
            {[
              { label: 'National ID', value: 'NATIONAL_ID' as const },
              { label: 'Residency card', value: 'RESIDENCY_CARD' as const },
            ].map((option) => {
              const selected = onboardingDocumentsForm.idDocumentKind === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => onOnboardingDocumentChange('idDocumentKind', option.value)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.idDocumentKind ? (
            <Text style={styles.errorText}>{fieldErrors.idDocumentKind}</Text>
          ) : null}

          {onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD' ? (
            <>
              <Text style={styles.fieldLabel}>Residency expiry date *</Text>
              <Pressable
                style={styles.selectTrigger}
                onPress={() => setIsIdentityExpiryPickerVisible(true)}
              >
                <Text
                  style={
                    onboardingDocumentsForm.idExpiryDate
                      ? styles.selectValueText
                      : styles.selectPlaceholderText
                  }
                >
                  {onboardingDocumentsForm.idExpiryDate || 'Select residency expiry date'}
                </Text>
                <Text style={styles.selectChevron}>▼</Text>
              </Pressable>
              {fieldErrors.idExpiryDate ? (
                <Text style={styles.errorText}>{fieldErrors.idExpiryDate}</Text>
              ) : null}
            </>
          ) : null}

          {renderOnboardingDocumentPicker(
            'ID / Residency back side *',
            'Upload clear front and back photos. The document must be valid and not expired.',
            'ID_BACK',
            onboardingDocumentsForm.idBack,
            getUploadedOnboardingDocument('ID_BACK'),
            () => void pickOnboardingDocument('idBack', 'image'),
            () => void captureOnboardingDocument('idBack'),
          )}
          {fieldErrors.idBack ? <Text style={styles.errorText}>{fieldErrors.idBack}</Text> : null}

          {renderOnboardingDocumentPicker(
            'Driving license *',
            'Upload a clear valid photo showing the permitted vehicle categories.',
            'DRIVING_LICENSE',
            onboardingDocumentsForm.drivingLicense,
            getUploadedOnboardingDocument('DRIVING_LICENSE'),
            () => void pickOnboardingDocument('drivingLicense', 'document'),
            () => void captureOnboardingDocument('drivingLicense'),
          )}
          {fieldErrors.drivingLicense ? (
            <Text style={styles.errorText}>{fieldErrors.drivingLicense}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Driving license expiry date</Text>
          <Pressable
            style={styles.selectTrigger}
            onPress={() => setIsDrivingLicenseExpiryPickerVisible(true)}
          >
            <Text
              style={
                onboardingDocumentsForm.drivingLicenseExpiryDate
                  ? styles.selectValueText
                  : styles.selectPlaceholderText
              }
            >
              {onboardingDocumentsForm.drivingLicenseExpiryDate ||
                'Select driving license expiry date'}
            </Text>
            <Text style={styles.selectChevron}>▼</Text>
          </Pressable>
          {fieldErrors.drivingLicenseExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.drivingLicenseExpiryDate}</Text>
          ) : null}

          {renderOnboardingDocumentPicker(
            'Self-verification selfie',
            'You may be asked to complete a selfie verification step.',
            'SELF_IDENTITY_VERIFICATION',
            onboardingDocumentsForm.selfIdentityVerification,
            getUploadedOnboardingDocument('SELF_IDENTITY_VERIFICATION'),
            () => void pickOnboardingDocument('selfIdentityVerification', 'image'),
            () => void captureOnboardingDocument('selfIdentityVerification'),
            true,
          )}

          {documentsStatus?.missingDocumentLabels?.length ? (
            <Text style={styles.helper}>
              Missing documents: {documentsStatus.missingDocumentLabels.join(', ')}
            </Text>
          ) : null}

          <Pressable
            style={[styles.primaryButton, !canSubmitOnboardingReview && styles.primaryButtonDisabled]}
            disabled={!canSubmitOnboardingReview}
            onPress={() => void onSubmitForReview()}
          >
            {isSubmittingReview ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Submit for Review</Text>
            )}
          </Pressable>

          {documentsStatus?.submittedForReviewAt ? (
            <Text style={styles.statusText}>
              Submitted for review at{' '}
              {new Date(documentsStatus.submittedForReviewAt).toLocaleString()}
            </Text>
          ) : null}

          {!canSubmitOnboardingReview ? (
            <Text style={styles.helper}>
              Upload all required documents first, then the review button will be enabled.
            </Text>
          ) : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

      </ScrollView>
      {isIdentityExpiryPickerVisible ? (
        <ExpoDateTimePicker
          mode="date"
          presentation="dialog"
          value={
            onboardingDocumentsForm.idExpiryDate
              ? new Date(onboardingDocumentsForm.idExpiryDate)
              : new Date()
          }
          minimumDate={new Date()}
          onValueChange={(_event, selectedDate) => {
            onOnboardingDocumentChange('idExpiryDate', toDateOnly(selectedDate.toISOString()));
            setIsIdentityExpiryPickerVisible(false);
          }}
          onDismiss={() => setIsIdentityExpiryPickerVisible(false)}
        />
      ) : null}
      {isDrivingLicenseExpiryPickerVisible ? (
        <ExpoDateTimePicker
          mode="date"
          presentation="dialog"
          value={
            onboardingDocumentsForm.drivingLicenseExpiryDate
              ? new Date(onboardingDocumentsForm.drivingLicenseExpiryDate)
              : new Date()
          }
          minimumDate={new Date()}
          onValueChange={(_event, selectedDate) => {
            onOnboardingDocumentChange(
              'drivingLicenseExpiryDate',
              toDateOnly(selectedDate.toISOString()),
            );
            setIsDrivingLicenseExpiryPickerVisible(false);
          }}
          onDismiss={() => setIsDrivingLicenseExpiryPickerVisible(false)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );

  function renderOnboardingDocumentPicker(
    label: string,
    instruction: string,
    type:
      | 'PERSONAL_SELFIE'
      | 'ID_FRONT'
      | 'ID_BACK'
      | 'DRIVING_LICENSE'
      | 'SELF_IDENTITY_VERIFICATION',
    asset: LocalDocumentAsset | undefined,
    uploaded: DriverOnboardingDocument | undefined,
    onPick: () => void,
    onCapture: () => void,
    optional = false,
  ): React.ReactNode {
    const isUploading = activeOnboardingUploadType === type;
    const previewUri = asset?.uri || uploaded?.url;
    const isImagePreview =
      (asset?.mimeType?.startsWith('image/') ?? false) ||
      (uploaded?.mimeType?.startsWith('image/') ?? false);

    return (
      <View style={styles.docRow}>
        <Text style={styles.fieldLabel}>{label}{optional ? '' : ''}</Text>
        <Text style={styles.helper}>{instruction}</Text>
        {previewUri && isImagePreview ? (
          <Image source={{ uri: previewUri }} style={styles.onboardingPreview} />
        ) : null}
        {asset ? <Text style={styles.fileName}>{asset.fileName ?? 'Selected file'}</Text> : null}
        {!asset && uploaded ? (
          <Text style={styles.fileName}>
            Uploaded: {uploaded.status}
            {uploaded.expiresAt ? ` | Expires ${uploaded.expiresAt.slice(0, 10)}` : ''}
          </Text>
        ) : null}
        {uploaded?.rejectionReason ? (
          <Text style={styles.errorText}>{uploaded.rejectionReason}</Text>
        ) : null}
        <View style={styles.docButtonsRow}>
          <Pressable
            style={styles.uploadButtonSmall}
            onPress={() => {
              Alert.alert('Add document', 'Choose how you want to provide this file.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Take photo', onPress: onCapture },
                { text: 'Choose file', onPress: onPick },
              ]);
            }}
            disabled={Boolean(activeOnboardingUploadType)}
          >
            <Text style={styles.uploadButtonText}>{asset || uploaded ? 'Replace' : 'Add'}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.uploadButtonSmall,
              (!asset || Boolean(activeOnboardingUploadType)) && styles.continueButtonDisabled,
            ]}
            disabled={!asset || Boolean(activeOnboardingUploadType)}
            onPress={() => void uploadSelectedOnboardingDocument(type)}
          >
            {isUploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.uploadButtonText}>Upload</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 10,
  },
  loadingText: { color: '#475569' },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    paddingBottom: 30,
  },
  header: { gap: 4, marginBottom: 4 },
  progress: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 27, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', fontSize: 14 },
  helper: { color: '#64748B', fontSize: 13 },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorText: { color: '#DC2626', fontSize: 12 },
  successText: { color: '#15803D', fontSize: 12 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionChipSelected: { borderColor: '#1D4ED8', backgroundColor: '#DBEAFE' },
  selectTrigger: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValueText: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
  },
  selectPlaceholderText: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 15,
  },
  selectChevron: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 12,
  },
  optionText: { color: '#334155', fontSize: 12 },
  optionTextSelected: { color: '#1D4ED8', fontWeight: '700' },
  docRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  onboardingPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  fileName: { color: '#475569', fontSize: 12 },
  docButtonsRow: { flexDirection: 'row', gap: 8 },
  uploadButtonSmall: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  continueButtonDisabled: { opacity: 0.5 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  statusText: { textAlign: 'center', color: '#475569', fontSize: 12 },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
