import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Palette } from '@/constants/theme';
import { useOfflineSyncStore } from '@/stores/useOfflineSyncStore';
import { useAuthStore } from '@/stores/useAuthStore';

export default function ProfileScreen() {
  const userId = useAuthStore((s) => s.userId);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  const pendingCount = useOfflineSyncStore((s) => s.pendingCount);
  const quarantinedCount = useOfflineSyncStore((s) => s.quarantinedCount);
  const quarantinedItems = useOfflineSyncStore((s) => s.quarantinedItems);
  const retryQuarantined = useOfflineSyncStore((s) => s.retryQuarantined);
  const removeQuarantined = useOfflineSyncStore((s) => s.removeQuarantined);
  const syncNow = useOfflineSyncStore((s) => s.syncNow);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>User & Offline Diagnostics</Text>

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>AUTHENTICATION STATE</Text>
        <Text style={styles.userText}>User ID: {userId || 'Anonymous / Not Logged In'}</Text>
        <Text style={styles.tokenText}>
          Token: {token ? `${token.slice(0, 16)}...` : 'None (Offline Mode)'}
        </Text>

        <View style={styles.buttonRow}>
          {!userId ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() =>
                setAuth({
                  uid: 'test_user_mobile_001',
                  token: 'mock_firebase_token_001',
                  email: 'mobile.user@zsehealth.app',
                })
              }
            >
              <Text style={styles.actionBtnText}>Login Test User A</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={() => logout()}>
              <Text style={styles.actionBtnText}>Sign Out (Isolate Queue)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Queue Diagnostics */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>OFFLINE QUEUE STATUS</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Pending Sync:</Text>
          <Text style={[styles.statValue, { color: Palette.emerald400 }]}>{pendingCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Quarantined (Dead-Letter):</Text>
          <Text style={[styles.statValue, { color: Palette.rose400 }]}>{quarantinedCount}</Text>
        </View>

        <TouchableOpacity style={styles.syncBtn} onPress={() => syncNow()}>
          <Text style={styles.syncBtnText}>Drain Offline Queue Now</Text>
        </TouchableOpacity>
      </View>

      {/* Quarantined Items List */}
      {quarantinedItems.length > 0 && (
        <View style={styles.card}>
          <View style={styles.quarantineHeader}>
            <Text style={styles.cardLabel}>QUARANTINED MUTATIONS</Text>
            <TouchableOpacity onPress={() => retryQuarantined()}>
              <Text style={styles.retryAllText}>Retry All</Text>
            </TouchableOpacity>
          </View>

          {quarantinedItems.map((item) => (
            <View key={item.id} style={styles.quarantineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.quarantineEndpoint}>{item.endpoint}</Text>
                <Text style={styles.quarantineReason}>{item.quarantine_reason || 'Unknown failure'}</Text>
                <Text style={styles.quarantineTime}>
                  ID: {item.id.slice(0, 8)}... | Retries: {item.retry_count}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity
                  style={styles.miniBtn}
                  onPress={() => retryQuarantined(item.id)}
                >
                  <Text style={styles.miniBtnText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.miniBtn, styles.miniDeleteBtn]}
                  onPress={() => removeQuarantined(item.id)}
                >
                  <Text style={styles.miniBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.slate950,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerTitle: {
    color: Palette.slate100,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  card: {
    backgroundColor: Palette.slate900,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  cardLabel: {
    color: Palette.slate500,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
  },
  userText: {
    color: Palette.slate200,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  tokenText: {
    color: Palette.slate500,
    fontSize: 12,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    backgroundColor: Palette.slate800,
    borderWidth: 1,
    borderColor: Palette.slate700,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dangerBtn: {
    borderColor: Palette.rose400,
  },
  actionBtnText: {
    color: Palette.slate100,
    fontSize: 13,
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    color: Palette.slate400,
    fontSize: 13,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  syncBtn: {
    backgroundColor: Palette.emerald400,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  syncBtnText: {
    color: Palette.slate950,
    fontSize: 13,
    fontWeight: 'bold',
  },
  quarantineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  retryAllText: {
    color: Palette.emerald400,
    fontSize: 12,
    fontWeight: 'bold',
  },
  quarantineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Palette.slate800,
  },
  quarantineEndpoint: {
    color: Palette.slate200,
    fontSize: 13,
    fontWeight: '600',
  },
  quarantineReason: {
    color: Palette.rose400,
    fontSize: 11,
    marginTop: 2,
  },
  quarantineTime: {
    color: Palette.slate500,
    fontSize: 10,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  miniBtn: {
    backgroundColor: Palette.slate800,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  miniDeleteBtn: {
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
  },
  miniBtnText: {
    color: Palette.slate200,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
