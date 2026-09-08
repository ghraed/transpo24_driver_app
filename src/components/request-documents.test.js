import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal } from 'react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { RequestDocuments } from './request-documents';
import {
  listRequestDocuments,
  acknowledgeDocuments,
  uploadRequestDocument,
  openRequestFile,
} from '@/lib/request-files';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/lib/request-files', () => ({
  DOCUMENT_TYPES: [
    'PICKUP_AUTHORIZATION',
    'INSURANCE',
    'PURCHASE_PROOF',
    'OTHER',
  ],
  listRequestDocuments: jest.fn(),
  acknowledgeDocuments: jest.fn(),
  uploadRequestDocument: jest.fn(),
  openRequestFile: jest.fn(),
}));
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  openRequestFile.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());
function button(tree, label) {
  return tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find(
      (node) => node.findAll((child) => child.props.children === label).length,
    );
}
async function render(customer = true) {
  let tree;
  await act(async () => {
    tree = create(<RequestDocuments requestId="request" customer={customer} />);
  });
  return tree;
}
it('does not prompt before backend confirms booking and payment hold', async () => {
  listRequestDocuments.mockResolvedValue({
    files: [],
    canUpload: false,
    shouldPrompt: false,
  });
  const tree = await render();
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(button(tree, 'documents.add')).toBeUndefined();
  await act(async () => tree.unmount());
});
it('asks the customer after payment hold and records the later choice', async () => {
  listRequestDocuments.mockResolvedValue({
    files: [],
    canUpload: true,
    shouldPrompt: true,
  });
  acknowledgeDocuments.mockResolvedValue({ ok: true });
  const tree = await render();
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  await act(async () => button(tree, 'documents.later').props.onPress());
  expect(acknowledgeDocuments).toHaveBeenCalledWith('request');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => tree.unmount());
});
it('keeps uploaded official files organized by type in request details', async () => {
  listRequestDocuments.mockResolvedValue({
    files: [],
    canUpload: true,
    shouldPrompt: false,
  });
  const tree = await render();
  await act(async () => button(tree, 'documents.add').props.onPress());
  const file = {
    id: 'file',
    fileName: 'insurance.pdf',
    mimeType: 'application/pdf',
    size: 100,
    documentType: 'INSURANCE',
  };
  uploadRequestDocument.mockResolvedValue(file);
  listRequestDocuments.mockResolvedValue({
    files: [file],
    canUpload: true,
    shouldPrompt: false,
  });
  await act(async () =>
    button(tree, 'documents.type.INSURANCE').props.onPress(),
  );
  expect(uploadRequestDocument).toHaveBeenCalledWith('request', 'INSURANCE');
  await act(async () => button(tree, 'insurance.pdf').props.onPress());
  expect(openRequestFile).toHaveBeenCalledWith(
    '/request-files/file/content',
    'insurance.pdf',
  );
  await act(async () => tree.unmount());
});
it('shows documents to the driver without customer upload or prompt controls', async () => {
  listRequestDocuments.mockResolvedValue({
    files: [
      {
        id: 'file',
        fileName: 'proof.png',
        size: 250,
        documentType: 'PURCHASE_PROOF',
      },
    ],
    canUpload: false,
    shouldPrompt: false,
  });
  const tree = await render(false);
  expect(button(tree, 'documents.add')).toBeUndefined();
  expect(button(tree, 'proof.png')).toBeDefined();
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => tree.unmount());
});

it('keeps all four type choices in the booking prompt and preserves it after cancelling the picker', async () => {
  listRequestDocuments.mockResolvedValue({
    files: [],
    canUpload: true,
    shouldPrompt: true,
  });
  uploadRequestDocument.mockResolvedValue(null);
  const tree = await render();
  await act(async () => button(tree, 'documents.add').props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  for (const type of [
    'PICKUP_AUTHORIZATION',
    'INSURANCE',
    'PURCHASE_PROOF',
    'OTHER',
  ]) {
    expect(button(tree, `documents.type.${type}`)).toBeDefined();
  }
  await act(async () => button(tree, 'documents.type.OTHER').props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(acknowledgeDocuments).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
