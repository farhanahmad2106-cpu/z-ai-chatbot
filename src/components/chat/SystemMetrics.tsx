import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface SystemMetricsProps {
  cpuUsage: number; // 0 to 100
  ramUsedGB: number;
  ramTotalGB: number;
}

export const SystemMetrics: React.FC<SystemMetricsProps> = ({
  cpuUsage,
  ramUsedGB,
  ramTotalGB,
}) => {
  const ramPercentage = Math.min((ramUsedGB / ramTotalGB) * 100, 100);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Metrics</Text>
      
      {/* CPU Row */}
      <View style={styles.metricRow}>
        <View style={styles.labelWrapper}>
          <Text style={styles.metricLabel}>CPU Usage</Text>
          <Text style={styles.metricValue}>{cpuUsage}%</Text>
        </View>
        <View style={styles.barContainer}>
          <View style={[styles.barFill, { width: `${cpuUsage}%` }]} />
        </View>
      </View>

      {/* RAM Row */}
      <View style={styles.metricRow}>
        <View style={styles.labelWrapper}>
          <Text style={styles.metricLabel}>RAM Utilization</Text>
          <Text style={styles.metricValue}>
            {ramUsedGB.toFixed(1)} / {ramTotalGB.toFixed(1)} GB
          </Text>
        </View>
        <View style={styles.barContainer}>
          <View 
            style={[
              styles.barFill, 
              styles.ramFill, 
              { width: `${ramPercentage}%` },
              ramPercentage > 75 ? styles.ramWarning : null
            ]} 
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    padding: 12,
    borderRadius: 0,
    width: '100%',
  },
  title: {
    fontFamily: theme.typography.labelSm.fontFamily,
    fontSize: theme.typography.labelSm.fontSize,
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  metricRow: {
    marginBottom: 10,
  },
  labelWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricLabel: {
    fontFamily: 'System', // Technical monospaced fallback
    fontSize: 11,
    color: theme.colors.onSurface,
  },
  metricValue: {
    fontFamily: 'System',
    fontSize: 11,
    color: theme.colors.onSurface,
    fontWeight: '600',
  },
  barContainer: {
    height: 8,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 0,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.colors.primary, // Indigo
    borderRadius: 0,
  },
  ramFill: {
    backgroundColor: theme.colors.secondary, // Green for stable RAM
  },
  ramWarning: {
    backgroundColor: theme.colors.error, // Crimson Red if high memory (>75%)
  },
});

export default SystemMetrics;
