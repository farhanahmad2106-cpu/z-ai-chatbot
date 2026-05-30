import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme';
import { useTelemetryStore } from '../stores/useTelemetryStore';
import { ProgressBar } from '../components/shared/ProgressBar';
import { SegmentedBar } from '../components/shared/SegmentedBar';

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { metrics, error, startTelemetryFeed, stopTelemetryFeed } = useTelemetryStore();

  // Polling management triggered by Focus
  useFocusEffect(
    useCallback(() => {
      startTelemetryFeed();
      return () => stopTelemetryFeed();
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity 
          onPress={() => navigation.openDrawer()}
          style={styles.menuBtn}
        >
          <Text style={styles.menuText}>[=]</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SYSTEM TELEMETRY</Text>
        <View style={styles.nodeStatus}>
          <Text style={styles.nodeText}>Active</Text>
        </View>
      </View>

      {/* Main metrics panel */}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Metrics Stream Disconnected</Text>
          <Text style={styles.errorSub}>{error}</Text>
        </View>
      ) : !metrics ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Establishing secure telemetry feed...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          
          {/* Card: Active GGUF Engine */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>AI RUNTIME ENGINE</Text>
            <View style={styles.engineRow}>
              <Text style={styles.engineLabel}>LOADED CONTEXT:</Text>
              <Text style={styles.engineValue}>
                {metrics.model_loaded ? metrics.model_loaded.toUpperCase() : 'NO MODEL IN RAM'}
              </Text>
            </View>
            <Text style={styles.cardDesc}>
              Z-AI follows a strict memory containment architecture. Models are loaded dynamically into RAM and automatically purged on user-session locks to protect local hardware metrics.
            </Text>
          </View>

          {/* Card: CPU Performance */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>CPU PERFORMANCE</Text>
            <ProgressBar percentage={metrics.cpu_percent} label="Local CPU Cores Capacity" />
            <Text style={styles.cardDesc}>
              Quantized GGUF inference executes CPU computations locally. Real-time scheduling prevents thread locks and maintains interface responsiveness during streaming.
            </Text>
          </View>

          {/* Card: Memory & Storage Allocation */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>RESOURCE DEPLOYMENT</Text>
            <SegmentedBar 
              used={metrics.ram_used_mb / 1024} 
              total={metrics.ram_total_mb / 1024} 
              label="System Memory (RAM)" 
              unit="GB" 
            />
            <SegmentedBar 
              used={metrics.disk_used_gb} 
              total={metrics.disk_total_gb} 
              label="Local Storage Capacity (SSD)" 
              unit="GB" 
            />
            <Text style={styles.cardDesc}>
              SQLite + SQLCipher transaction logs are saved offline. Model files are stored locally in data/models directory.
            </Text>
          </View>

        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.gutter,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    backgroundColor: theme.colors.surface,
  },
  menuBtn: {
    padding: 8,
  },
  menuText: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
    letterSpacing: 0.5,
  },
  nodeStatus: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nodeText: {
    color: theme.colors.secondary,
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  errorText: {
    color: theme.colors.error,
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorSub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.gutter,
    gap: 16,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    padding: 16,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.onSurfaceVariant,
    marginBottom: 16,
    letterSpacing: 1,
  },
  engineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
    marginBottom: 12,
  },
  engineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  engineValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  cardDesc: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 18,
  }
});

export default DashboardScreen;
