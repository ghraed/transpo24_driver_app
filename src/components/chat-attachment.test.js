import React from 'react';
import { expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { ChatAttachment } from './chat-attachment';
import { openRequestFile, downloadRequestFile } from '@/lib/request-files';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
jest.mock('@/lib/request-files', () => ({
  openRequestFile: jest.fn(async () => undefined),
  downloadRequestFile: jest.fn(async () => false),
}));

it('routes the attachment tap to viewing and the separate download button to saving', async () => {
  let tree;
  await act(async () => {
    tree = create(<ChatAttachment url="/request-files/file/content" name="proof.pdf" />);
  });
  const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
  await act(async () => { buttons[0].props.onPress(); });
  expect(openRequestFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  expect(downloadRequestFile).not.toHaveBeenCalled();
  await act(async () => { buttons.find((node) => node.findAll((child) => child.props.children === 'documents.download').length).props.onPress(); });
  expect(downloadRequestFile).toHaveBeenCalledWith('/request-files/file/content', 'proof.pdf');
  await act(async () => tree.unmount());
});
