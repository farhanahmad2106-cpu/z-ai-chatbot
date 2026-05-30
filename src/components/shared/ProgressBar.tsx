import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface ProgressBarProps {
  percentage: number;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, label }) => {
  const capped = Math.min(100, Math.max(0, percentage));
  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.labelText}>{label}</Text>
          <Text style={styles.valueText}>{Math.round(capped)}%</Text>
        </View>
      )}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${capped}%` }]} />
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
    height: 10,
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.outline,
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  }
});
