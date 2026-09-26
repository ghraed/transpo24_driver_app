import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const CONFIRMATION = "DELETE ACCOUNT";

export function DeleteAccountDialog({
  isDeleting,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === CONFIRMATION && !isDeleting;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isDeleting) onCancel();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>{t("Delete account?")}</Text>
          <Text style={styles.body}>
            {t(
              "Deleting your account permanently removes or anonymizes your personal details and signs you out on all devices. This cannot be undone. Complete or cancel any active transport request first.",
            )}
          </Text>
          <Text style={styles.body}>
            {t("Type {{confirmation}} to confirm.", {
              confirmation: CONFIRMATION,
            })}
          </Text>
          <TextInput
            style={styles.input}
            value={confirmation}
            onChangeText={setConfirmation}
            accessibilityLabel={t("Account deletion confirmation")}
            placeholder={CONFIRMATION}
            placeholderTextColor="#68768A"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isDeleting}
          />
          <View style={styles.actions}>
            <Pressable
              testID="cancel-account-deletion"
              style={styles.button}
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={onCancel}
            >
              <Text style={styles.cancel}>{t("Cancel")}</Text>
            </Pressable>
            <Pressable
              testID="confirm-account-deletion"
              style={[
                styles.button,
                styles.deleteButton,
                !canDelete && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canDelete, busy: isDeleting }}
              disabled={!canDelete}
              onPress={() => {
                if (canDelete) onConfirm();
              }}
            >
              <Text style={styles.deleteText}>
                {isDeleting ? t("Deleting account...") : t("Delete account")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#111827" },
  body: { marginTop: 10, fontSize: 14, lineHeight: 20, color: "#68768A" },
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#111827",
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  cancel: { color: "#111827", fontSize: 14, fontWeight: "700" },
  deleteButton: { backgroundColor: "#C82424", borderColor: "#C82424" },
  deleteText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  disabled: { opacity: 0.4 },
});
