import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../../theme';
import { parseScannedIngredients, ParsedIngredient } from '../../utils/ingredientParser';

interface ScannedIngredientsViewProps {
  rawResponse: any;
  overallScore?: number;
}

export const ScannedIngredientsView: React.FC<ScannedIngredientsViewProps> = ({
  rawResponse,
  overallScore = 78,
}) => {
  // Process raw response into clean structured ingredient list
  const ingredients: ParsedIngredient[] = useMemo(() => {
    return parseScannedIngredients(rawResponse);
  }, [rawResponse]);

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.title}>Scanned Product Ingredients</Text>
        <View style={styles.badgeGroup}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>Score: {overallScore}</Text>
          </View>
          <View style={styles.filterButton}>
            <Text style={styles.filterText}>⚙ Filter</Text>
          </View>
        </View>
      </View>

      {/* Section Subtitle */}
      <Text style={styles.sectionHeader}>KEY INGREDIENTS</Text>

      {/* Ingredients Grid */}
      <View style={styles.grid}>
        {ingredients.map((ing) => {
          const isSafe = ing.safetyLabel === 'Safe';
          const isModerate = ing.safetyLabel === 'Moderate';

          const badgeBg = isSafe
            ? 'rgba(16, 185, 129, 0.12)'
            : isModerate
            ? 'rgba(245, 158, 11, 0.12)'
            : 'rgba(239, 68, 68, 0.12)';

          const badgeColor = isSafe ? '#10b981' : isModerate ? '#f59e0b' : '#ef4444';

          return (
            <View key={ing.id} style={styles.card}>
              {/* Card Title & Safety Badge */}
              <View style={styles.cardHeader}>
                <Text style={styles.ingredientName} numberOfLines={1}>
                  {ing.name}
                </Text>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.badgeText, { color: badgeColor }]}>
                    {ing.safetyLabel}
                  </Text>
                </View>
              </View>

              {/* Ingredient Description (BODY) */}
              <Text style={styles.descriptionText}>
                {ing.description}
              </Text>

              {/* Footer */}
              <View style={styles.cardFooter}>
                <Text style={styles.footerText}>
                  {ing.detectedText || `Detected ingredient: ${ing.name.toLowerCase()}`}
                </Text>
              </View>
            </View>
          );
        })}
      </div
    ></View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0f1d',
    borderRadius: 16,
    padding: 20,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreBadge: {
    backgroundColor: 'rgba(217, 119, 6, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.4)',
  },
  scoreText: {
    color: '#fbbf24',
    fontWeight: '700',
    fontSize: 13,
  },
  filterButton: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  card: {
    width: '32%',
    minWidth: 260,
    backgroundColor: '#131b2e',
    borderRadius: 14,
    padding: 16,
    margin: '0.66%',
    borderWidth: 1,
    borderColor: '#1e293b',
    justify: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ingredientName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  descriptionText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 8,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  footerText: {
    color: '#475569',
    fontSize: 11,
  },
});
