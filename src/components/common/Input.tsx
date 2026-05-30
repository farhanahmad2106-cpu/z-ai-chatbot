import React, { useState } from 'react';
import { 
  TextInput, 
  View, 
  Text, 
  StyleSheet, 
  TextInputProps, 
  ViewStyle, 
  TextStyle 
} from 'react-native';
import { theme } from '../../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.colors.onSurfaceVariant}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.textInput,
          isFocused && styles.focusedBorder,
          error ? styles.errorInput : null,
          inputStyle,
        ]}
        {...rest}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.gutter,
    width: '100%',
  },
  label: {
    fontFamily: theme.typography.labelSm.fontFamily,
    fontSize: theme.typography.labelSm.fontSize,
    color: theme.colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 0, // Strict sharp brutalist corners
    color: theme.colors.onSurface,
    paddingHorizontal: 12,
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.typography.bodyLg.fontFamily,
  },
  focusedBorder: {
    borderColor: theme.colors.primary,
  },
  errorInput: {
    borderColor: theme.colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // #ef4444 error container tint
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.bodyMd.fontSize,
    fontFamily: theme.typography.bodyMd.fontFamily,
    marginTop: 4,
  },
});

export default Input;
