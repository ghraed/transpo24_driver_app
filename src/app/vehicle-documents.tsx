import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DRIVER_ONBOARDING_STEP_LABELS } from '@/components/driver-onboarding-checklist';
import { DRIVER_IMAGE_GUIDANCE, MAX_DRIVER_IMAGE_BYTES, prepareDriverUploadImage } from '@/lib/driver-upload-image';
import { dateOnlyForPicker, formatLocalDateOnly } from '@/lib/local-date-only';
import {
  getDriverDocumentsStatus,
  updateDriverDocumentDates,
  uploadDriverDocument,
} from '@/lib/api';
import {
  clearOnboardingDocumentsDraft,
  persistLastOnboardingRoute,
  persistOnboardingDocumentsDraft,
  persistOnboardingDocumentsStatus,
  readOnboardingDocumentsDraft,
  readOnboardingDocumentsStatus,
} from '@/lib/auth-storage';
import type {
  DriverDocumentType,
  DriverDocumentsStatusResponse,
  DriverOnboardingDocument,
  IdentityDocumentKind,
  LocalDocumentAsset,
} from '@/types/auth';

const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
type UploadableOnboardingField =
  | 'personalSelfie'
  | 'idFront'
  | 'idBack'
  | 'drivingLicense';
type UploadableDocumentType =
  | 'PERSONAL_SELFIE'
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'DRIVING_LICENSE';
const DOCUMENT_TYPE_BY_FIELD: Record<
  UploadableOnboardingField,
  UploadableDocumentType
> = {
  personalSelfie: 'PERSONAL_SELFIE',
  idFront: 'ID_FRONT',
  idBack: 'ID_BACK',
  drivingLicense: 'DRIVING_LICENSE',
};
const FIELD_BY_DOCUMENT_TYPE: Record<UploadableDocumentType, UploadableOnboardingField> = {
  PERSONAL_SELFIE: 'personalSelfie',
  ID_FRONT: 'idFront',
  ID_BACK: 'idBack',
  DRIVING_LICENSE: 'drivingLicense',
};

interface OnboardingDocumentsForm {
  personalSelfie?: LocalDocumentAsset;
  idFront?: LocalDocumentAsset;
  idBack?: LocalDocumentAsset;
  drivingLicense?: LocalDocumentAsset;
  idDocumentKind: IdentityDocumentKind | '';
  idExpiryDate: string;
  drivingLicenseExpiryDate: string;
  replacementDocumentTypes: UploadableDocumentType[];
  dateDraftVersion: 2;
}

function toDateOnly(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  return isoDate.slice(0, 10);
}

export default function VehicleDocumentsScreen() {
  const router = useRouter();
  const { returnTo, vehicleId } = useLocalSearchParams<{ returnTo?: string; vehicleId?: string }>();
  const checkDetailsRoute = returnTo === 'check-details' && typeof vehicleId === 'string'
    ? ({ pathname: '/check-details', params: { vehicleId } } as Href) : null;
  const { t } = useTranslation();

  const [onboardingDocumentsForm, setOnboardingDocumentsForm] = useState<OnboardingDocumentsForm>({
    idDocumentKind: '',
    idExpiryDate: '',
    drivingLicenseExpiryDate: '',
    replacementDocumentTypes: [],
    dateDraftVersion: 2,
  });
  const [documentsStatus, setDocumentsStatus] = useState<DriverDocumentsStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeOnboardingUploadType, setActiveOnboardingUploadType] =
    useState<DriverDocumentType | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [isContinuing, setIsContinuing] = useState<boolean>(false);
  const [activeDateField, setActiveDateField] = useState<
    'idExpiryDate' | 'drivingLicenseExpiryDate' | null
  >(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState<boolean>(false);

  const isBusy = Boolean(activeOnboardingUploadType);

  useEffect(() => {
    void persistLastOnboardingRoute('/vehicle-documents');
  }, []);

  const applyDocumentsStatus = useCallback((status: DriverDocumentsStatusResponse): void => {
    setDocumentsStatus(status);

    setOnboardingDocumentsForm((prev) => ({
      ...prev,
      idDocumentKind: prev.idDocumentKind || status.identityDocumentKind || '',
      replacementDocumentTypes: Array.from(new Set([
        ...(prev.replacementDocumentTypes ?? []),
        ...(prev.idDocumentKind && status.identityDocumentKind && prev.idDocumentKind !== status.identityDocumentKind
          ? (['ID_FRONT', 'ID_BACK'] as const).filter((type) =>
              status.uploadedDocuments.some((document) => document.type === type))
          : []),
      ])),
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
  }, []);

  const loadDocumentsStatus = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const draftRaw = await readOnboardingDocumentsDraft();
      if (draftRaw) {
        const draft = JSON.parse(draftRaw) as Partial<OnboardingDocumentsForm>;
        setOnboardingDocumentsForm((prev) => ({
          ...prev,
          ...draft,
          // Older drafts could contain automatically generated expiry dates.
          idExpiryDate: draft.dateDraftVersion === 2 ? draft.idExpiryDate ?? '' : '',
          drivingLicenseExpiryDate: draft.dateDraftVersion === 2 ? draft.drivingLicenseExpiryDate ?? '' : '',
          // Older drafts may require a second upload solely because the licence date changed.
          replacementDocumentTypes: (draft.replacementDocumentTypes ?? []).filter(
            (type) => type !== 'DRIVING_LICENSE',
          ),
          dateDraftVersion: 2,
        }));
      }

      const cachedRaw = await readOnboardingDocumentsStatus();
      const cachedStatus = cachedRaw
        ? (JSON.parse(cachedRaw) as DriverDocumentsStatusResponse)
        : null;
      if (cachedStatus) {
        applyDocumentsStatus(cachedStatus);
      }

      const status = await getDriverDocumentsStatus();
      applyDocumentsStatus(status);
      await persistOnboardingDocumentsStatus(JSON.stringify(status));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Failed to load document status.');
      setLoadError(message);
    } finally {
      setHasHydratedDraft(true);
      setIsLoading(false);
    }
  }, [applyDocumentsStatus, t]);

  useEffect(() => {
    if (!hasHydratedDraft) return;
    void persistOnboardingDocumentsDraft(JSON.stringify(onboardingDocumentsForm));
  }, [hasHydratedDraft, onboardingDocumentsForm]);

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
          errors[fieldKey] = t('{{label}} is required.', { label });
        }
        return;
      }

      const mime = asset.mimeType ?? '';
      if (!PHOTO_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = t('{{label}} must be JPEG, PNG, or WEBP.', { label });
        return;
      }

      if (asset.fileSize && asset.fileSize > MAX_DRIVER_IMAGE_BYTES) {
        errors[fieldKey] = t('{{label}} must be 5 MB or smaller.', { label });
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
      errors.idDocumentKind = t('Choose whether you have a national ID or residency card.');
    }

    const drivingLicenseAsset = onboardingDocumentsForm.drivingLicense;
    if (!drivingLicenseAsset && normalizedMissing.has('DRIVING_LICENSE')) {
      errors.drivingLicense = t('Driving license photo is required.');
    } else if (drivingLicenseAsset) {
      const mime = drivingLicenseAsset.mimeType ?? '';
      if (!PHOTO_ALLOWED_TYPES.has(mime)) {
        errors.drivingLicense = t('Driving license must be JPEG, PNG, or WEBP.');
      } else if (drivingLicenseAsset.fileSize && drivingLicenseAsset.fileSize > MAX_DRIVER_IMAGE_BYTES) {
        errors.drivingLicense = t('Driving license image must be 5 MB or smaller.');
      }
    }

    const validateExpiryDate = (value: string, fieldKey: string, label: string): void => {
      if (!value.trim()) return;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        errors[fieldKey] = t('{{label}} must be a valid date.', { label });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsed.setHours(0, 0, 0, 0);
      if (parsed.getTime() < today.getTime()) {
        errors[fieldKey] = t('{{label}} must not be in the past.', { label });
      }
    };

    if (onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD') {
      if (!onboardingDocumentsForm.idExpiryDate.trim()) {
        errors.idExpiryDate = t('Residency expiry date is required.');
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
  }, [documentsStatus, onboardingDocumentsForm, t]);

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const onOnboardingDocumentChange = <K extends keyof OnboardingDocumentsForm>(
    key: K,
    value: OnboardingDocumentsForm[K],
  ): void => {
    setSubmitError('');
    setSubmitSuccess('');
    setOnboardingDocumentsForm((prev) => {
      const changed = prev[key] !== value;
      const affectedTypes: UploadableDocumentType[] = key === 'idDocumentKind'
        ? ['ID_FRONT', 'ID_BACK']
        : [];
      const replacements = changed
        ? affectedTypes.filter((type) => documentsStatus?.uploadedDocuments.some((document) => document.type === type))
        : [];
      const replacementDocumentTypes = Array.from(new Set([
        ...(prev.replacementDocumentTypes ?? []),
        ...replacements,
      ]));
      if (key === 'idDocumentKind') {
        const nextKind = value as OnboardingDocumentsForm['idDocumentKind'];
        return {
          ...prev,
          idDocumentKind: nextKind,
          idExpiryDate: nextKind === prev.idDocumentKind ? prev.idExpiryDate : '',
          replacementDocumentTypes,
        };
      }
      return { ...prev, [key]: value, replacementDocumentTypes };
    });
  };

  const setOnboardingDocument = (
    key: UploadableOnboardingField,
    value?: LocalDocumentAsset,
  ): void => {
    setOnboardingDocumentsForm((prev) => ({ ...prev, [key]: value }));
  };

  const uploadOnboardingAsset = useCallback(
    async (
      type: UploadableDocumentType,
      asset: LocalDocumentAsset,
    ): Promise<boolean> => {
      setActiveOnboardingUploadType(type);
      setSubmitError('');
      setSubmitSuccess('');

      try {
        const payload: {
          documentType:
            | 'PERSONAL_SELFIE'
            | 'ID_FRONT'
            | 'ID_BACK'
            | 'DRIVING_LICENSE'
            | 'SELF_IDENTITY_VERIFICATION';
          file: LocalDocumentAsset;
          expiryDate?: string;
          idDocumentKind?: IdentityDocumentKind;
        } = {
          documentType: type,
          file: asset,
        };

        if (type === 'ID_FRONT' || type === 'ID_BACK') {
          if (onboardingDocumentsForm.idDocumentKind) {
            payload.idDocumentKind = onboardingDocumentsForm.idDocumentKind;
          }
          if (onboardingDocumentsForm.idExpiryDate) {
            payload.expiryDate = onboardingDocumentsForm.idExpiryDate;
          }
        }

        if (
          type === 'DRIVING_LICENSE' &&
          onboardingDocumentsForm.drivingLicenseExpiryDate
        ) {
          payload.expiryDate = onboardingDocumentsForm.drivingLicenseExpiryDate;
        }

        const status = await uploadDriverDocument(payload);
        const fieldKey = FIELD_BY_DOCUMENT_TYPE[type];
        applyDocumentsStatus(status);
        await persistOnboardingDocumentsStatus(JSON.stringify(status));
        setOnboardingDocumentsForm((prev) => ({
          ...prev,
          [fieldKey]: undefined,
          replacementDocumentTypes: (prev.replacementDocumentTypes ?? []).filter((documentType) => documentType !== type),
        }));
        setSubmitSuccess(t('Document uploaded successfully.'));
        return true;
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : t('Failed to upload driver document.'),
        );
        return false;
      } finally {
        setActiveOnboardingUploadType(null);
      }
    },
    [
      applyDocumentsStatus,
      onboardingDocumentsForm.drivingLicenseExpiryDate,
      onboardingDocumentsForm.idDocumentKind,
      onboardingDocumentsForm.idExpiryDate,
      t,
    ],
  );

  const canSelectOnboardingDocument = (key: UploadableOnboardingField): boolean => {
    if (key !== 'idFront' && key !== 'idBack') return true;
    if (!onboardingDocumentsForm.idDocumentKind) {
      setSubmitError(t('Choose whether you have a national ID or residency card.'));
      return false;
    }
    if (onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD' && !onboardingDocumentsForm.idExpiryDate) {
      setSubmitError(t('Residency expiry date is required.'));
      return false;
    }
    if (fieldErrors.idExpiryDate) {
      setSubmitError(fieldErrors.idExpiryDate);
      return false;
    }
    return true;
  };

  const pickOnboardingDocument = async (
    key: UploadableOnboardingField,
  ): Promise<void> => {
    if (activeOnboardingUploadType || !canSelectOnboardingDocument(key)) return;

    setSubmitError('');
    setSubmitSuccess('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError(t('Media library permission is required to select images.'));
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
    try {
      const normalizedAsset = await prepareDriverUploadImage(asset);
      setOnboardingDocument(key, normalizedAsset);
      await uploadOnboardingAsset(DOCUMENT_TYPE_BY_FIELD[key], normalizedAsset);
    } catch (error) {
      setSubmitError(t(error instanceof Error && error.message === 'Image files must be 5 MB or smaller.'
        ? error.message : 'Failed to upload driver document.'));
    }
  };

  const takeOnboardingDocumentImage = async (
    key: UploadableOnboardingField,
  ): Promise<void> => {
    if (activeOnboardingUploadType || !canSelectOnboardingDocument(key)) return;

    setSubmitError('');
    setSubmitSuccess('');

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError(t('Camera permission is required to take document images.'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    try {
      const normalizedAsset = await prepareDriverUploadImage(asset);
      setOnboardingDocument(key, normalizedAsset);
      await uploadOnboardingAsset(DOCUMENT_TYPE_BY_FIELD[key], normalizedAsset);
    } catch (error) {
      setSubmitError(t(error instanceof Error && error.message === 'Image files must be 5 MB or smaller.'
        ? error.message : 'Failed to upload driver document.'));
    }
  };

  const hasRequiredDocumentsReadyForUpload = Boolean(documentsStatus) &&
    (documentsStatus?.requiredDocuments ?? []).every((type) => {
      const hasUploadedDocument = documentsStatus?.uploadedDocuments.some(
        (document) => document.type === type && document.status !== 'REJECTED',
      );
      if (hasUploadedDocument) return true;

      const fieldKey = FIELD_BY_DOCUMENT_TYPE[type as UploadableDocumentType];
      return fieldKey ? Boolean(onboardingDocumentsForm[fieldKey]) : false;
    });

  const hasReplacementFilesReady = (onboardingDocumentsForm.replacementDocumentTypes ?? []).every((type) =>
    Boolean(onboardingDocumentsForm[FIELD_BY_DOCUMENT_TYPE[type]]),
  );
  const canContinue =
    hasReplacementFilesReady &&
    !isBusy &&
    !isContinuing &&
    !isLoading &&
    !hasFieldErrors &&
    hasRequiredDocumentsReadyForUpload;

  const onContinue = async (): Promise<void> => {
    if (!canContinue) return;

    setSubmitError('');
    setSubmitSuccess('');
    setIsContinuing(true);

    try {
      for (const [fieldKey, documentType] of Object.entries(DOCUMENT_TYPE_BY_FIELD) as [
        UploadableOnboardingField,
        UploadableDocumentType,
      ][]) {
        const asset = onboardingDocumentsForm[fieldKey];
        if (asset) {
          const uploaded = await uploadOnboardingAsset(documentType, asset);
          if (!uploaded) return;
        }
      }

      let status = await getDriverDocumentsStatus();
      const requestedDates: { idExpiryDate?: string; drivingLicenseExpiryDate?: string } = {};
      if (
        onboardingDocumentsForm.idDocumentKind === 'RESIDENCY_CARD' &&
        onboardingDocumentsForm.idExpiryDate &&
        ['ID_FRONT', 'ID_BACK'].some((type) =>
          status.uploadedDocuments.some((document) =>
            document.type === type && toDateOnly(document.expiresAt) !== onboardingDocumentsForm.idExpiryDate,
          ),
        )
      ) {
        requestedDates.idExpiryDate = onboardingDocumentsForm.idExpiryDate;
      }
      if (
        onboardingDocumentsForm.drivingLicenseExpiryDate &&
        status.uploadedDocuments.some((document) =>
          document.type === 'DRIVING_LICENSE' &&
          toDateOnly(document.expiresAt) !== onboardingDocumentsForm.drivingLicenseExpiryDate,
        )
      ) {
        requestedDates.drivingLicenseExpiryDate = onboardingDocumentsForm.drivingLicenseExpiryDate;
      }
      if (Object.keys(requestedDates).length > 0) {
        status = await updateDriverDocumentDates(requestedDates);
      }
      applyDocumentsStatus(status);
      await persistOnboardingDocumentsStatus(JSON.stringify(status));

      if (status.missingDocuments.length > 0) {
        setSubmitError(
          t('Missing required documents: {{documents}}.', {
            documents: status.missingDocuments.join(', '),
          }),
        );
        return;
      }

      await clearOnboardingDocumentsDraft();
      router.replace(checkDetailsRoute ?? '/vehicle-information?flow=onboarding');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Failed to verify driver documents.');
      setSubmitError(message);
    } finally {
      setIsContinuing(false);
    }
  };

  const getUploadedOnboardingDocument = useCallback(
    (type: DriverDocumentType): DriverOnboardingDocument | undefined =>
      documentsStatus?.uploadedDocuments.find((document) => document.type === type),
    [documentsStatus],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F1B900" />
        <Text style={styles.loadingText}>{t('Loading document setup...')}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadDocumentsStatus()}>
          <Text style={styles.retryButtonText}>{t('Retry')}</Text>
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
          <Pressable style={styles.backButton} onPress={() => router.replace('/complete-profile')}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
          <Text style={styles.progress}>{t(DRIVER_ONBOARDING_STEP_LABELS[2])}</Text>
          <Text style={styles.title}>{t('Upload Driver Documents')}</Text>
          <Text style={styles.subtitle}>
            {t('Upload the documents needed for verification, then continue to vehicle information.')}
          </Text>
          <Text style={styles.helper}>{t('Clear documents help us verify your driver account faster.')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Identity Verification Documents')}</Text>
          <Text style={styles.helper}>
            {t('Select or take clear images of the required personal documents before submitting your account for review.')}
          </Text>
          <Text style={styles.helper}>{t(DRIVER_IMAGE_GUIDANCE)}</Text>

          {renderOnboardingDocumentPicker(
            t('Recent personal photo / selfie *'),
            t('Take a selfie in front of a white background with good lighting and a clear face.'),
            'PERSONAL_SELFIE',
            onboardingDocumentsForm.personalSelfie,
            getUploadedOnboardingDocument('PERSONAL_SELFIE'),
            () => void pickOnboardingDocument('personalSelfie'),
            () => void takeOnboardingDocumentImage('personalSelfie'),
          )}
          {fieldErrors.personalSelfie ? (
            <Text style={styles.errorText}>{fieldErrors.personalSelfie}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Document type *')}</Text>
          <View style={styles.optionWrap}>
            {[
              { label: t('National ID'), value: 'NATIONAL_ID' as const },
              { label: t('Residency card'), value: 'RESIDENCY_CARD' as const },
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
              <Text style={styles.fieldLabel}>{t('Residency expiry date *')}</Text>
              <Pressable
                style={styles.selectTrigger}
                onPress={() => setActiveDateField('idExpiryDate')}
              >
                <Text
                  style={
                    onboardingDocumentsForm.idExpiryDate
                      ? styles.selectValueText
                      : styles.selectPlaceholderText
                  }
                >
                  {onboardingDocumentsForm.idExpiryDate || t('Select residency expiry date')}
                </Text>
                <Text style={styles.selectChevron}>▼</Text>
              </Pressable>
              {fieldErrors.idExpiryDate ? (
                <Text style={styles.errorText}>{fieldErrors.idExpiryDate}</Text>
              ) : null}
            </>
          ) : null}

          {renderOnboardingDocumentPicker(
            t('ID or residency card front *'),
            t('Upload clear photos of the front and back sides. The document must not be expired.'),
            'ID_FRONT',
            onboardingDocumentsForm.idFront,
            getUploadedOnboardingDocument('ID_FRONT'),
            () => void pickOnboardingDocument('idFront'),
            () => void takeOnboardingDocumentImage('idFront'),
          )}
          {fieldErrors.idFront ? <Text style={styles.errorText}>{fieldErrors.idFront}</Text> : null}

          {renderOnboardingDocumentPicker(
            t('ID or residency card back *'),
            t('Upload clear photos of the front and back sides. The document must not be expired.'),
            'ID_BACK',
            onboardingDocumentsForm.idBack,
            getUploadedOnboardingDocument('ID_BACK'),
            () => void pickOnboardingDocument('idBack'),
            () => void takeOnboardingDocumentImage('idBack'),
          )}
          {fieldErrors.idBack ? <Text style={styles.errorText}>{fieldErrors.idBack}</Text> : null}

          {renderOnboardingDocumentPicker(
            t('Driving license *'),
            t('Select or take a clear valid image showing the allowed vehicle categories.'),
            'DRIVING_LICENSE',
            onboardingDocumentsForm.drivingLicense,
            getUploadedOnboardingDocument('DRIVING_LICENSE'),
            () => void pickOnboardingDocument('drivingLicense'),
            () => void takeOnboardingDocumentImage('drivingLicense'),
          )}
          {fieldErrors.drivingLicense ? (
            <Text style={styles.errorText}>{fieldErrors.drivingLicense}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Driving license expiry date')}</Text>
          <Pressable
            style={styles.selectTrigger}
            onPress={() => setActiveDateField('drivingLicenseExpiryDate')}
          >
            <Text
              style={
                onboardingDocumentsForm.drivingLicenseExpiryDate
                  ? styles.selectValueText
                  : styles.selectPlaceholderText
              }
            >
              {onboardingDocumentsForm.drivingLicenseExpiryDate ||
                t('Select driving license expiry date')}
            </Text>
            <Text style={styles.selectChevron}>▼</Text>
          </Pressable>
          {fieldErrors.drivingLicenseExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.drivingLicenseExpiryDate}</Text>
          ) : null}

          {(onboardingDocumentsForm.replacementDocumentTypes ?? []).length > 0 ? (
            <Text style={styles.errorText}>{t('Re-upload affected documents after changing their details.')}</Text>
          ) : null}

          {documentsStatus?.missingDocumentLabels?.length ? (
            <Text style={styles.helper}>
              {t('Missing documents')}: {documentsStatus.missingDocumentLabels.join(', ')}
            </Text>
          ) : null}

          {documentsStatus?.submittedForReviewAt ? (
            <Text style={styles.statusText}>
              {t('Submitted for review at')}{' '}
              {new Date(documentsStatus.submittedForReviewAt).toLocaleString(undefined, { hour12: false })}
            </Text>
          ) : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={() => void onContinue()}
        >
          {isContinuing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.continueButtonText}>{t('Next')}</Text>
          )}
        </Pressable>
      </ScrollView>
      {activeDateField ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={dateOnlyForPicker(onboardingDocumentsForm[activeDateField])}
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            if (event.type === 'dismissed') {
              setActiveDateField(null);
              return;
            }

            if (selectedDate) {
              onOnboardingDocumentChange(activeDateField, formatLocalDateOnly(selectedDate));
            }
            setActiveDateField(null);
          }}
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
      | 'DRIVING_LICENSE',
    asset: LocalDocumentAsset | undefined,
    uploaded: DriverOnboardingDocument | undefined,
    onPick: () => void,
    onTakeImage: () => void,
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
        {asset ? <Text style={styles.fileName}>{asset.fileName ?? t('Selected file')}</Text> : null}
        {!asset && uploaded ? (
          <Text style={styles.fileName}>
            {t('Uploaded')}: {uploaded.status}
            {uploaded.expiresAt ? ` | ${t('Expires')} ${uploaded.expiresAt.slice(0, 10)}` : ''}
          </Text>
        ) : null}
        {uploaded?.rejectionReason ? (
          <Text style={styles.errorText}>{uploaded.rejectionReason}</Text>
        ) : null}
        <View style={styles.docButtonsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Select')} ${label}`}
            style={styles.uploadButtonSmall}
            onPress={onPick}
            disabled={Boolean(activeOnboardingUploadType)}
          >
            <Text style={styles.uploadButtonText}>{asset || uploaded ? t('Replace') : t('Select')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Take image')} ${label}`}
            style={styles.uploadButtonSmall}
            onPress={onTakeImage}
            disabled={Boolean(activeOnboardingUploadType)}
          >
            {isUploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.uploadButtonText}>{t('Take image')}</Text>
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
  loadingText: { color: '#707A8C' },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    paddingBottom: 30,
  },
  header: { gap: 4, marginBottom: 4 },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#F1B900',
    fontWeight: '700',
    fontSize: 14,
  },
  progress: { color: '#F1B900', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 27, fontWeight: '700', color: '#202020' },
  subtitle: { color: '#707A8C', fontSize: 14 },
  helper: { color: '#707A8C', fontSize: 13 },
  section: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#202020' },
  fieldLabel: { color: '#505A6A', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
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
    borderColor: '#DFE3E8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionChipSelected: { borderColor: '#F1B900', backgroundColor: '#FFF1B8' },
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
  optionText: { color: '#505A6A', fontSize: 12 },
  optionTextSelected: { color: '#F1B900', fontWeight: '700' },
  docRow: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  onboardingPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#DFE3E8',
  },
  fileName: { color: '#707A8C', fontSize: 12 },
  docButtonsRow: { flexDirection: 'row', gap: 8 },
  uploadButtonSmall: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#171717', fontWeight: '800', fontSize: 13 },
  continueButton: {
    marginTop: 4,
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: { opacity: 0.5 },
  continueButtonText: { color: '#171717', fontWeight: '800', fontSize: 15 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#171717', fontWeight: '800', fontSize: 15 },
  statusText: { textAlign: 'center', color: '#707A8C', fontSize: 12 },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: { color: '#171717', fontWeight: '800' },
});
