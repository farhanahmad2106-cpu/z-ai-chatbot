import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'primary';
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'primary' }) => {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return { bg: 'rgba(16, 185, 129, 0.1)', border: theme.colors.secondary, text: theme.colors.secondary };
      case 'warning':
        return { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#f59e0b' };
      case 'error':
        return { bg: 'rgba(239, 68, 68, 0.1)', border: theme.colors.error, text: theme.colors.error };
      default:
        return { bg: 'rgba(79, 70, 229, 0.1)', border: theme.colors.primary, text: theme.colors.primary };
    }
  };
  const s = getStyles();
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }]}>
      <Text style={[styles.text, { color: s.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }
});
