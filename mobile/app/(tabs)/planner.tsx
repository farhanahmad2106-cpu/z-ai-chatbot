import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Palette } from '@/constants/theme';

export default function PlannerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Revolving 7-Day Meal Planner</Text>
      <Text style={styles.subtitle}>Personalized regional nutrition with clinical allergy checks</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.slate950,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: Palette.emerald400,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: Palette.slate400,
    fontSize: 13,
    textAlign: 'center',
  },
});
