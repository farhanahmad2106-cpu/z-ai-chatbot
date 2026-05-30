import React from 'react';
import { View, StyleSheet, ViewStyle, ViewProps } from 'react-native';
import { theme } from '../../theme';

interface CardProps extends ViewProps {
  style?: ViewStyle;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ style, children, ...rest }) => {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 0, // Rectilinear alignment, sharp 0px corners
    padding: theme.spacing.gutter,
    width: '100%',
  },
});

export default Card;
