import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChatAttachment } from './chat-attachment';
import type { ChatMessage } from '@/types/chat';

export function ChatAttachmentGroup({ messages, metadata, onReport }: {
  messages: ChatMessage[]; metadata: React.ReactNode; onReport?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const groupWidth = Math.min(280, (width - 32) * 0.8);
  const tileSize = (groupWidth - 3) / 2;
  return <>
    <View style={[styles.grid, { width: groupWidth }]}>
      {messages.slice(0, 4).map((message, index) => {
        const more = index === 3 && messages.length > 4;
        return <Pressable key={message.id} onLongPress={onReport ? () => onReport(message.id) : undefined}>
          <ChatAttachment url={message.attachmentUrl!} name={message.body ?? 'document.pdf'} tileSize={tileSize}
            onOpen={more ? () => setExpanded(true) : undefined}
            openLabel={more ? t('documents.viewAll', { count: messages.length }) : undefined}
            overlay={more ? <View style={styles.more}><Text style={styles.moreText}>+{messages.length - 4}</Text></View> : undefined}
          />
        </Pressable>;
      })}
    </View>
    <View style={styles.metadata}>{metadata}</View>
    <Modal visible={expanded} animationType="slide" onRequestClose={() => setExpanded(false)}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('documents.selected', { count: messages.length })}</Text>
          <Pressable accessibilityRole="button" style={styles.close} onPress={() => setExpanded(false)}><Text>{t('documents.close')}</Text></Pressable>
        </View>
        <FlatList data={messages} keyExtractor={message => message.id} contentContainerStyle={styles.list}
          renderItem={({ item }) => <Pressable onLongPress={onReport ? () => onReport(item.id) : undefined}>
            <ChatAttachment url={item.attachmentUrl!} name={item.body ?? 'document.pdf'} />
          </Pressable>}
        />
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, borderRadius: 9, overflow: 'hidden' },
  more: { width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 32, fontWeight: '600', color: '#FFFFFF' },
  metadata: { alignSelf: 'flex-end', borderRadius: 10, backgroundColor: 'rgba(11,20,26,0.48)', paddingHorizontal: 7, paddingVertical: 3, marginTop: 3 },
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF' },
  title: { flex: 1, color: '#1E293B', fontSize: 18, fontWeight: '600' },
  close: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  list: { padding: 16, gap: 12, alignItems: 'center' },
});
