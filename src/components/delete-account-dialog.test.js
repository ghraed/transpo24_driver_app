import { jest, test, expect, afterEach } from "@jest/globals";
import React from "react";
import { act, create } from "react-test-renderer";
import { Modal, TextInput } from "react-native";
import { DeleteAccountDialog } from "./delete-account-dialog";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
});

test("requires the exact confirmation and supports cancellation", async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await act(async () => {
    renderer = create(
      <DeleteAccountDialog
        isDeleting={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  });
  const confirm = () =>
    renderer.root.findAll(
      (node) => node.props.testID === "confirm-account-deletion",
    )[0];
  for (const value of ["", "DELETE", "delete account", "DELETE ACCOUNT "]) {
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText(value);
    });
    expect(confirm().props.disabled).toBe(true);
    await act(async () => {
      confirm().props.onPress();
    });
  }
  expect(onConfirm).not.toHaveBeenCalled();
  await act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText("DELETE ACCOUNT");
  });
  expect(confirm().props.disabled).toBe(false);
  await act(async () => {
    confirm().props.onPress();
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer.root
      .findAll((node) => node.props.testID === "cancel-account-deletion")[0]
      .props.onPress();
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("blocks repeated confirmation and dismissal while deleting", async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await act(async () => {
    renderer = create(
      <DeleteAccountDialog
        isDeleting
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  });
  expect(renderer.root.findByType(TextInput).props.editable).toBe(false);
  await act(async () => {
    renderer.root
      .findAll((node) => node.props.testID === "confirm-account-deletion")[0]
      .props.onPress();
    renderer.root.findByType(Modal).props.onRequestClose();
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onCancel).not.toHaveBeenCalled();
});
