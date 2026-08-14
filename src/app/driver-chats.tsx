import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverBottomNav, DRIVER_BOTTOM_NAV_HEIGHT } from '@/components/driver-bottom-nav';
import { DriverIcon } from '@/components/driver-icon';
import { getDriverChatRooms } from '@/lib/api';
import type { ChatRoom } from '@/types/chat';

function messagePreview(room: ChatRoom): string {
  if (room.lastMessage?.body) return room.lastMessage.body;
  if (room.lastMessage?.type === 'IMAGE') return 'Photo';
  return 'Open this conversation';
}

function messageTime(room: ChatRoom): string {
  const date = new Date(room.lastMessage?.createdAt || room.updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
}

export default function DriverChatsScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getDriverChatRooms();
      setRooms(response.rooms ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadRooms();
  }, [loadRooms]));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F4B900" />
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIcon}><DriverIcon name="chat" size={38} color="#F2B900" /></View>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptyText}>Chats become available after a customer accepts your offer.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rooms.map((room) => (
            <Pressable
              key={room.id}
              style={({ pressed }) => [styles.chatCard, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/chat', params: { chatRoomId: room.id } })}
            >
              <View style={styles.avatar}>
                <DriverIcon name="profile" size={26} color="#171717" />
              </View>
              <View style={styles.chatCopy}>
                <View style={styles.chatTop}>
                  <Text style={styles.chatTitle}>Job {room.transportRequestId.slice(-6).toUpperCase()}</Text>
                  <Text style={styles.time}>{messageTime(room)}</Text>
                </View>
                <Text style={styles.preview} numberOfLines={1}>{messagePreview(room)}</Text>
              </View>
              {(room.unreadCount ?? 0) > 0 ? (
                <View style={styles.unread}><Text style={styles.unreadText}>{room.unreadCount}</Text></View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <DriverBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F9' },
  header: { minHeight: 106, paddingHorizontal: 22, paddingTop: 28, justifyContent: 'center' },
  title: { color: '#171717', fontSize: 31, fontWeight: '800', letterSpacing: -0.7 },
  list: { paddingHorizontal: 22, paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT + 24, gap: 12 },
  chatCard: {
    minHeight: 86,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.7 },
  avatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFC515' },
  chatCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  chatTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatTitle: { color: '#202020', fontSize: 17, fontWeight: '800' },
  time: { color: '#9CA6B5', fontSize: 12 },
  preview: { marginTop: 6, color: '#707A8C', fontSize: 14 },
  unread: { minWidth: 23, height: 23, marginLeft: 10, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3B900' },
  unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT },
  emptyIcon: { width: 76, height: 76, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8DC' },
  emptyTitle: { marginTop: 20, color: '#202020', fontSize: 19, fontWeight: '800' },
  emptyText: { marginTop: 8, color: '#707A8C', fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
