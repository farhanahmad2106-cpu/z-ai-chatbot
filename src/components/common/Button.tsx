import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  ViewStyle, 
  TextStyle 
} from 'react-native';
import { theme } from '../../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryContainer;
      case 'destructive':
        return styles.destructiveContainer;
      case 'primary':
      default:
        return styles.primaryContainer;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'secondary':
        return styles.secondaryText;
      case 'primary':
      case 'destructive':
      default:
        return styles.lightText;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.baseContainer,
        getContainerStyle(),
        disabled && styles.disabledContainer,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'secondary' ? theme.colors.primary : '#ffffff'} 
          size="small" 
        />
      ) : (
        <Text style={[styles.baseText, getTextStyle(), disabled && styles.disabledText, textStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.gutter,
    borderRadius: 0, // Rectilinear, sharp brutalist corners
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primaryContainer: {
    backgroundColor: theme.colors.primary,
  },
  secondaryContainer: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.outline,
  },
  destructiveContainer: {
    backgroundColor: theme.colors.error,
  },
  disabledContainer: {
    backgroundColor: theme.colors.surfaceVariant,
    borderColor: 'transparent',
  },
  baseText: {
    fontFamily: theme.typography.labelSm.fontFamily,
    fontSize: theme.typography.bodyLg.fontSize,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  lightText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: theme.colors.onSurface,
  },
  disabledText: {
    color: theme.colors.onSurfaceVariant,
  },
});

export default Button;
