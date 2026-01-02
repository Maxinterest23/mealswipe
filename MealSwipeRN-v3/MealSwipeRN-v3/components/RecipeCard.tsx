import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Recipe } from '@/types';
import { Colors, BorderRadius, Spacing, CostTierInfo, BadgeInfo } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Gradient colors for recipes
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

// Simple badge components
function CostTierBadge({ tier }: { tier: number }) {
  const info = CostTierInfo[tier];
  return (
    <View style={[styles.badge, { backgroundColor: info.color }]}>
      <Text style={styles.badgeText}>{info.symbol}</Text>
    </View>
  );
}

function TimeBadge({ minutes }: { minutes: number }) {
  return (
    <View style={[styles.badge, styles.badgeTranslucent]}>
      <Ionicons name="time-outline" size={14} color={Colors.white} />
      <Text style={[styles.badgeText, { marginLeft: 4 }]}>{minutes}m</Text>
    </View>
  );
}

function DietaryBadge({ badge }: { badge: string }) {
  const info = BadgeInfo[badge];
  if (!info) return null;
  return (
    <View style={[styles.badge, styles.badgeTranslucent]}>
      <Text style={{ fontSize: 16 }}>{info.icon}</Text>
    </View>
  );
}

function StatItem({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon as any} size={24} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface RecipeCardProps {
  recipe: Recipe;
  isInMenu: boolean;
  onAddToMenu: () => void;
}

export function RecipeCard({ recipe, isInMenu, onAddToMenu }: RecipeCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const gradientColors = getGradientColors(recipe.imageGradient);
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;

  return (
    <Pressable style={styles.container} onPress={handleFlip}>
      {/* Front of card */}
      {!isFlipped && (
        <LinearGradient colors={gradientColors} style={styles.gradient}>
          {/* Recipe icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.recipeIcon}>{recipe.icon}</Text>
          </View>

          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
          />

          {/* Content */}
          <View style={styles.frontContent}>
            {/* Badges */}
            <View style={styles.badgeRow}>
              <CostTierBadge tier={recipe.costTier} />
              <TimeBadge minutes={totalTime} />
              {recipe.badges.slice(0, 2).map(badge => (
                <DietaryBadge key={badge} badge={badge} />
              ))}
            </View>

            {/* Title */}
            <Text style={styles.recipeName}>{recipe.name}</Text>

            {/* Nutrition */}
            <Text style={styles.nutritionText}>
              {recipe.nutrition.calories} kcal • {recipe.nutrition.protein}g protein
            </Text>

            {/* Hint */}
            <Text style={styles.hintText}>Tap to see ingredients →</Text>
          </View>
        </LinearGradient>
      )}

      {/* Back of card */}
      {isFlipped && (
        <View style={styles.cardBack}>
          <ScrollView
            style={styles.backScrollView}
            contentContainerStyle={styles.backContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.backTitle}>{recipe.name}</Text>

            {/* Stats */}
            <View style={styles.statsRow}>
              <StatItem icon="time-outline" value={totalTime} label="mins" />
              <StatItem icon="people-outline" value={recipe.servings} label="servings" />
              <StatItem icon="flame-outline" value={recipe.nutrition.calories} label="kcal" />
            </View>

            <View style={styles.divider} />

            {/* Ingredients */}
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

            <View style={styles.divider} />

            {/* Method */}
            <Text style={styles.sectionTitle}>Method</Text>
            {recipe.methodSteps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
            
            <Text style={styles.hintTextBack}>Tap to flip back</Text>
          </ScrollView>
        </View>
      )}

      {/* Add to menu button */}
      <TouchableOpacity
        style={[
          styles.addButton,
          isInMenu && styles.addButtonAdded,
        ]}
        onPress={(e) => {
          e.stopPropagation();
          onAddToMenu();
        }}
        activeOpacity={0.8}
      >
        <Ionicons
          name={isInMenu ? 'checkmark' : 'add'}
          size={28}
          color={Colors.white}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardBack: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  iconContainer: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recipeIcon: {
    fontSize: 120,
    opacity: 0.3,
  },
  bottomGradient: {
    ...StyleSheet.absoluteFillObject,
    top: '40%',
  },
  frontContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  badgeTranslucent: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  recipeName: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  nutritionText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  hintText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: Spacing.md,
  },
  hintTextBack: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  backScrollView: {
    flex: 1,
  },
  backContent: {
    padding: Spacing.xl,
    paddingBottom: 120,
  },
  backTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.lg,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: `${Colors.primary}33`,
    marginRight: Spacing.sm,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  ingredientQty: {
    fontSize: 15,
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
    marginRight: Spacing.md,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  addButton: {
    position: 'absolute',
    bottom: 100,
    right: Spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  addButtonAdded: {
    backgroundColor: Colors.success,
  },
});
