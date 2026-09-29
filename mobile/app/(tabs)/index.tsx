import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Palette } from '@/constants/theme';
import { useOfflineSyncStore } from '@/stores/useOfflineSyncStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getCachedUserStats, CachedUserStats } from '@/services/foodCacheService';

export default function DashboardScreen() {
  const isOnline = useOfflineSyncStore((s) => s.isOnline);
  const isSyncing = useOfflineSyncStore((s) => s.isSyncing);
  const pendingCount = useOfflineSyncStore((s) => s.pendingCount);
  const quarantinedCount = useOfflineSyncStore((s) => s.quarantinedCount);
  const syncNow = useOfflineSyncStore((s) => s.syncNow);
  const userId = useAuthStore((s) => s.userId);

  const [stats, setStats] = useState<CachedUserStats | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadStats = async () => {
    if (userId) {
      const cached = await getCachedUserStats(userId);
      if (cached) setStats(cached);
    }
  };

  useEffect(() => {
    loadStats();
  }, [userId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await syncNow();
    await loadStats();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Palette.emerald400} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Z-SeHealth</Text>
          <Text style={styles.subtitle}>Precision Nutrition & Offline Sync Engine</Text>
        </View>
        <View style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
          <View style={[styles.statusDot, isOnline ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      {/* Sync Telemetry Banner */}
      {(pendingCount > 0 || quarantinedCount > 0 || isSyncing) && (
        <View style={styles.syncBanner}>
          <View style={styles.syncInfo}>
            <Text style={styles.syncTitle}>
              {isSyncing
                ? '⟳ Synchronizing mutations with server...'
                : `${pendingCount} mutation${pendingCount === 1 ? '' : 's'} pending offline sync`}
            </Text>
            {quarantinedCount > 0 && (
              <Text style={styles.quarantinedSub}>
                ⚠ {quarantinedCount} quarantined item{quarantinedCount === 1 ? '' : 's'} require inspection
              </Text>
            )}
          </View>
          {isOnline && !isSyncing && (
            <TouchableOpacity style={styles.syncButton} onPress={() => syncNow()}>
              <Text style={styles.syncButtonText}>Sync Now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Daily Nutrition Stats */}
      <View style={styles.statsCard}>
        <Text style={styles.cardHeader}>TODAY'S MACRO TOTALS</Text>
        <View style={styles.macroGrid}>
          <View style={styles.macroCol}>
            <Text style={styles.macroLabel}>CALORIES</Text>
            <Text style={[styles.macroVal, { color: Palette.emerald400 }]}>
              {stats?.calories ?? 0} kcal
            </Text>
          </View>
          <View style={styles.macroCol}>
            <Text style={styles.macroLabel}>PROTEIN</Text>
            <Text style={[styles.macroVal, { color: Palette.sky400 }]}>
              {stats?.protein ?? 0} g
            </Text>
          </View>
          <View style={styles.macroCol}>
            <Text style={styles.macroLabel}>CARBS</Text>
            <Text style={[styles.macroVal, { color: Palette.amber400 }]}>
              {stats?.carbs ?? 0} g
            </Text>
          </View>
          <View style={styles.macroCol}>
            <Text style={styles.macroLabel}>FAT</Text>
            <Text style={[styles.macroVal, { color: Palette.rose400 }]}>
              {stats?.fat ?? 0} g
            </Text>
          </View>
        </View>
      </View>

      {/* Offline Guarantees Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🛡️ Zero Silent Data Loss Guarantee</Text>
        <Text style={styles.infoDesc}>
          Every meal log and biometric update is transactionally persisted into SQLite with a stable
          RFC 4122 UUID v4 before network dispatch. Failed network requests automatically retry with
          exponential backoff when connection returns.
        </Text>
      </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: Palette.slate100,
    fontSize: 26,
    fontWeight: 'bold',
  },
  subtitle: {
    color: Palette.slate400,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  onlineBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: Palette.slate800,
  },
  offlineBadge: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: Palette.rose400,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: Palette.emerald400,
  },
  offlineDot: {
    backgroundColor: Palette.rose400,
  },
  statusText: {
    color: Palette.slate300,
    fontSize: 11,
    fontWeight: '600',
  },
  syncBanner: {
    backgroundColor: Palette.slate900,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncInfo: {
    flex: 1,
    marginRight: 10,
  },
  syncTitle: {
    color: Palette.emerald400,
    fontSize: 13,
    fontWeight: '600',
  },
  quarantinedSub: {
    color: Palette.rose400,
    fontSize: 11,
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: Palette.emerald400,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  syncButtonText: {
    color: Palette.slate950,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statsCard: {
    backgroundColor: Palette.slate900,
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  cardHeader: {
    color: Palette.slate500,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 14,
  },
  macroGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  macroCol: {
    alignItems: 'center',
  },
  macroLabel: {
    color: Palette.slate400,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  macroVal: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: Palette.slate800,
    borderRadius: 20,
    padding: 18,
  },
  infoTitle: {
    color: Palette.slate100,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoDesc: {
    color: Palette.slate400,
    fontSize: 12,
    lineHeight: 18,
  },
});
