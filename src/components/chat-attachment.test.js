jest.mock('@/lib/chat-outbox', () => ({ pendingChatOperations: () => [], chatAccountId: jest.fn(() => 'owner-a') }));
import React from 'react';
import { expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ChatAttachment } from './chat-attachment';
import { openRequestFile, downloadRequestFile } from '@/lib/request-files';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('@/lib/request-files', () => ({
  openRequestFile: jest.fn(async () => undefined),
  downloadRequestFile: jest.fn(async () => false),
}));

it('opens thumbnails directly but waits for confirmation before downloading', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree;
  await act(async () => {
    tree = create(<ChatAttachment url="/request-files/file/content" name="proof.pdf" />);
  });
  const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
  await act(async () => { buttons[0].props.onPress(); });
  expect(openRequestFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  expect(downloadRequestFile).not.toHaveBeenCalled();
  await act(async () => { buttons.find((node) => node.props.accessibilityLabel === 'documents.download').props.onPress(); });
  expect(downloadRequestFile).not.toHaveBeenCalled();
  expect(openRequestFile).toHaveBeenCalledTimes(1);
  const actions = alert.mock.calls[0][2];
  expect(actions[0]).toEqual({ text: 'Cancel', style: 'cancel' });
  await act(async () => { actions[1].onPress(); });
  expect(downloadRequestFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  await act(async () => tree.unmount());
  alert.mockRestore();
});

it('does not show a delayed private-file error after the account changes', async () => {
  const { chatAccountId } = jest.requireMock('@/lib/chat-outbox');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let rejectFile;
  openRequestFile.mockImplementationOnce(() => new Promise((_, reject) => { rejectFile = reject; }));
  let tree;
  await act(async () => { tree = create(<ChatAttachment url="/request-files/file/content" name="proof.pdf" />); });
  await act(async () => { tree.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  chatAccountId.mockReturnValue('owner-b');
  await act(async () => { rejectFile(new Error('account changed')); });
  expect(alert).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  chatAccountId.mockReturnValue('owner-a');
  alert.mockRestore();
});
