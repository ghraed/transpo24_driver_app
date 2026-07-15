import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/auth-context';
import {
  connectSocket,
  disconnectSocket,
  emitSocketDebugPing,
  joinTripRoomWithAck,
  leaveTripRoom,
  onSocketConnected,
  onSocketDebugPong,
  onSocketDisconnect,
  onSocketError,
  waitForSocketConnection,
} from '@/services/socketService';

export default function SocketDebugScreen() {
  const { accessToken } = useAuth();
  const { t } = useTranslation();
  const [tripId, setTripId] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = (message: string): void => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} - ${message}`, ...prev].slice(0, 80));
  };

  const setupListeners = (): void => {
    onSocketConnected((socketId) => appendLog(`Connected: ${socketId}`));
    onSocketDisconnect((reason) => appendLog(`Disconnected: ${reason}`));
    onSocketError((message) => appendLog(`Connect error: ${message}`));
    onSocketDebugPong((payload) => {
      appendLog(`PONG ok=${payload.ok} socket=${payload.socketId} user=${payload.userId} role=${payload.role}`);
    });
  };

  const onConnect = (): void => {
    if (!accessToken) {
      appendLog(t('Missing access token. Login first.'));
      return;
    }
    try {
      connectSocket(accessToken);
      setupListeners();
      appendLog(t('Connect requested. Waiting for ack...'));
      void waitForSocketConnection(5000)
        .then((socketId) => {
          appendLog(`Connect success (ack): ${socketId}`);
        })
        .catch((error) => {
          appendLog(error instanceof Error ? `${t('Connect failed')}: ${error.message}` : t('Connect failed.'));
        });
    } catch (error) {
      appendLog(error instanceof Error ? error.message : t('Connect failed.'));
    }
  };

  const onJoin = (): void => {
    if (!tripId.trim()) {
      appendLog(t('Enter trip id first.'));
      return;
    }
    try {
      appendLog(`joinTripRoom sent: ${tripId.trim()} (waiting ack...)`);
      void joinTripRoomWithAck(tripId.trim(), 5000)
        .then((response) => {
          appendLog(`joinTripRoom success: room=${response.room}`);
        })
        .catch((error) => {
          appendLog(error instanceof Error ? `joinTripRoom failed: ${error.message}` : t('joinTripRoom failed.'));
        });
    } catch (error) {
      appendLog(error instanceof Error ? error.message : t('joinTripRoom failed.'));
    }
  };

  const onLeave = (): void => {
    if (!tripId.trim()) {
      appendLog(t('Enter trip id first.'));
      return;
    }
    leaveTripRoom(tripId.trim());
    appendLog(`leaveTripRoom sent: ${tripId.trim()}`);
  };

  const onPing = (): void => {
    try {
      emitSocketDebugPing({
        tripId: tripId.trim() || undefined,
        note: 'driver-debug',
      });
      appendLog(t('socketDebugPing sent.'));
    } catch (error) {
      appendLog(error instanceof Error ? error.message : t('Ping failed.'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('Socket Debug (Driver)')}</Text>
        <TextInput
          style={styles.input}
          value={tripId}
          onChangeText={setTripId}
          placeholder={t('Trip ID (optional for ping, required for join)')}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <Pressable style={styles.button} onPress={onConnect}>
            <Text style={styles.buttonText}>{t('Connect')}</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={onJoin}>
            <Text style={styles.buttonText}>{t('Join Room')}</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable style={styles.button} onPress={onPing}>
            <Text style={styles.buttonText}>{t('Ping')}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.disconnectButton]}
            onPress={() => {
              disconnectSocket();
              appendLog(t('Socket disconnected manually.'));
            }}
          >
            <Text style={styles.buttonText}>{t('Disconnect')}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.leaveButton]} onPress={onLeave}>
            <Text style={styles.buttonText}>{t('Leave Room')}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.logPanel} contentContainerStyle={styles.logContent}>
        {logs.map((line) => (
          <Text key={line} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: 40, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  disconnectButton: { backgroundColor: '#DC2626' },
  leaveButton: { backgroundColor: '#475569' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  logPanel: { marginTop: 12, flex: 1, backgroundColor: '#0F172A', borderRadius: 10 },
  logContent: { padding: 10, gap: 8 },
  logLine: { color: '#E2E8F0', fontSize: 12 },
});
