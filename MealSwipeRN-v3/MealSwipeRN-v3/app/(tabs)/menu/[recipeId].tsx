import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { CostTierBadge, TimeBadge, DietaryBadge, StatItem, Button } from '@/components/ui';
import { getRecipeById } from '@/data/recipes';

const GRADIENT_COLORS: Record<string, [string, string]> = {
  '#FF6B35': ['#FF6B35', '#ff8a5c'],
  '#2EC4B6': ['#2EC4B6', '#25a99d'],
  '#22C55E': ['#22C55E', '#16a34a'],
  '#9B5DE5': ['#9B5DE5', '#7c3aed'],
  '#F59E0B': ['#F59E0B', '#d97706'],
  '#EC4899': ['#EC4899', '#db2777'],
  '#06B6D4': ['#06B6D4', '#0891b2'],
  '#EF4444': ['#EF4444', '#dc2626'],
  '#F97316': ['#F97316', '#ea580c'],
  '#A78BFA': ['#A78BFA', '#8b5cf6'],
};

function getGradientColors(gradient: string): [string, string] {
  const match = gradient.match(/#[A-Fa-f0-9]{6}/);
  if (match && GRADIENT_COLORS[match[0]]) {
    return GRADIENT_COLORS[match[0]];
  }
  return ['#FF6B35', '#ff8a5c'];
}

export default function RecipeDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const recipeIdParam = Array.isArray(recipeId) ? recipeId[0] : recipeId;
  const recipe = recipeIdParam ? getRecipeById(recipeIdParam) : undefined;

  if (!recipe) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Recipe not found</Text>
        <Text style={styles.subtitle}>Return to your menu to pick another meal.</Text>
      </View>
    );
  }

  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;
  const gradientColors = getGradientColors(recipe.imageGradient);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </Pressable>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={gradientColors} style={styles.hero}>
          <Text style={styles.heroIcon}>{recipe.icon}</Text>
          <Text style={styles.heroTitle}>{recipe.name}</Text>
          <View style={styles.badgeRow}>
            <CostTierBadge tier={recipe.costTier} size="small" />
            <TimeBadge minutes={totalTime} />
            {recipe.badges.slice(0, 3).map(badge => (
              <DietaryBadge key={badge} badge={badge} />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.statsRow}>
          <StatItem icon="time-outline" value={totalTime} label="mins" />
          <StatItem icon="people-outline" value={recipe.servings} label="servings" />
          <StatItem icon="flame-outline" value={recipe.nutrition.calories} label="kcal" />
        </View>

        <Button
          title="Start cooking mode"
          icon="restaurant-outline"
          onPress={() => router.push(`/menu/${recipe.id}/cook`)}
          style={styles.cookButton}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {recipe.ingredients.map((ing, index) => (
            <View key={index} style={styles.ingredientRow}>
              <View style={styles.ingredientDot} />
              <Text style={styles.ingredientName}>{ing.name}</Text>
              <Text style={styles.ingredientQty}>
                {ing.quantity} {ing.unit}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Method</Text>
          {recipe.methodSteps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {(recipe.tips?.length || recipe.substitutions?.length) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tips & Substitutions</Text>
            {recipe.tips?.map((tip, index) => (
              <View key={`tip-${index}`} style={styles.tipRow}>
                <Ionicons name="sparkles" size={16} color={Colors.primary} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
            {recipe.substitutions?.map((sub, index) => (
              <View key={`sub-${index}`} style={styles.tipRow}>
                <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
                <Text style={styles.tipText}>{sub}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backButton: {
    marginLeft: Spacing.xl,
    marginBottom: Spacing.sm,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  hero: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroIcon: {
    fontSize: 60,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  cookButton: {
    marginTop: Spacing.sm,
  },
  section: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
    marginRight: Spacing.sm,
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  ingredientQty: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  stepNumberText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: Spacing.xl,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
});
