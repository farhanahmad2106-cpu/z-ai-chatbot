import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface SegmentedBarProps {
  used: number;
  total: number;
  label?: string;
  unit?: string;
}

export const SegmentedBar: React.FC<SegmentedBarProps> = ({ used, total, label, unit = 'GB' }) => {
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>{label}</Text>
        <Text style={styles.valueText}>{used.toFixed(1)} / {total.toFixed(1)} {unit}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12.5,
    fontWeight: '500',
  },
  valueText: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 12.5,
  },
  track: {
    height: 16,
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.secondary,
  }
});
