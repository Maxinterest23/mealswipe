import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Pressable,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioPlayer } from 'expo-audio';
import { Recipe } from '@/types';
import { Colors, BorderRadius, Spacing, CostTierInfo, BadgeInfo } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const INGREDIENT_VISIBLE_COUNT = 5;
const INGREDIENT_ROW_HEIGHT = Spacing.sm * 2 + 20;
const METHOD_VISIBLE_COUNT = 6;
const IMAGE_OVERSCAN = 1.15;
const IMAGE_FOCUS_TARGET_Y = 0.38;
const DEFAULT_IMAGE_FOCUS_Y = 0.45;

const ADD_SOUND = require('../assets/sounds/positive.wav');

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
  const [imageLayout, setImageLayout] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [contentTopY, setContentTopY] = useState<number | null>(null);
  const addSoundPlayer = useAudioPlayer(ADD_SOUND);
  const insets = useSafeAreaInsets();

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const gradientColors = getGradientColors(recipe.imageGradient);
  const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;
  const ingredientsScrollable = recipe.ingredients.length > INGREDIENT_VISIBLE_COUNT;
  const focusTargetY =
    contentTopY === null
      ? IMAGE_FOCUS_TARGET_Y
      : Math.max(0.2, Math.min(0.55, (contentTopY - Spacing.md) / SCREEN_HEIGHT));
  const heroImageStyle = imageLayout
    ? [
        styles.heroImage,
        {
          width: imageLayout.width,
          height: imageLayout.height,
          left: imageLayout.offsetX,
          top: imageLayout.offsetY,
        },
      ]
    : [styles.heroImage, styles.heroImageFallback];

  useEffect(() => {
    let isMounted = true;
    if (!recipe.imageUrl) {
      setImageLayout(null);
      return;
    }

    Image.getSize(
      recipe.imageUrl,
      (width, height) => {
        if (!isMounted) return;
        const baseScale = Math.max(SCREEN_WIDTH / width, SCREEN_HEIGHT / height);
        const focusY =
          typeof recipe.imageFocusY === 'number' ? recipe.imageFocusY : DEFAULT_IMAGE_FOCUS_Y;
        const needsLift = focusY > focusTargetY;
        const scale = baseScale * (needsLift ? IMAGE_OVERSCAN : 1);
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const excessY = Math.max(0, scaledHeight - SCREEN_HEIGHT);
        const desiredOffsetY = focusTargetY * SCREEN_HEIGHT - focusY * scaledHeight;
        const clampedOffsetY = Math.min(0, Math.max(-excessY, desiredOffsetY));
        const offsetX = (SCREEN_WIDTH - scaledWidth) / 2;
        setImageLayout({
          width: scaledWidth,
          height: scaledHeight,
          offsetX,
          offsetY: clampedOffsetY,
        });
      },
      () => {
        if (isMounted) setImageLayout(null);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [recipe.imageUrl, recipe.imageFocusY, focusTargetY]);

  return (
    <Pressable style={styles.container} onPress={handleFlip}>
      {/* Front of card */}
      {!isFlipped && (
        <LinearGradient colors={gradientColors} style={styles.gradient}>
          {recipe.imageUrl ? (
            <>
              <Image source={{ uri: recipe.imageUrl }} style={heroImageStyle} />
              <LinearGradient
                colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
                locations={[0, 0.55, 1]}
                style={styles.imageScrim}
              />
            </>
          ) : null}
          {/* Recipe icon */}
          {!recipe.imageUrl ? (
            <View style={styles.iconContainer}>
              <Text style={styles.recipeIcon}>{recipe.icon}</Text>
            </View>
          ) : null}

          {/* Bottom gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={styles.bottomGradient}
          />

          {/* Content */}
          <View
            style={styles.frontContent}
            onLayout={(event) => {
              const nextTop = event.nativeEvent.layout.y;
              if (contentTopY !== nextTop) {
                setContentTopY(nextTop);
              }
            }}
          >
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
            {recipe.description ? (
              <Text style={styles.recipeDescription}>{recipe.description}</Text>
            ) : null}

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
          <View
            style={[
              styles.backScrollView,
              styles.backContent,
              {
                paddingTop: Spacing.xl + insets.top,
                paddingBottom: 120 + insets.bottom,
              },
            ]}
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
            <View style={styles.ingredientsListContainer}>
              {ingredientsScrollable ? (
                <GestureScrollView
                  style={styles.ingredientsScroll}
                  contentContainerStyle={styles.ingredientsScrollContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {recipe.ingredients.map((ing, index) => (
                    <View key={index} style={styles.ingredientRow}>
                      <View style={styles.ingredientDot} />
                      <Text style={styles.ingredientName}>{ing.name}</Text>
                      <Text style={styles.ingredientQty}>
                        {ing.quantity} {ing.unit}
                      </Text>
                    </View>
                  ))}
                </GestureScrollView>
              ) : (
                <View style={styles.ingredientsScrollContent}>
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
              )}
              {ingredientsScrollable && (
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.6)',
                    Colors.background,
                  ]}
                  style={styles.ingredientsFade}
                />
              )}
            </View>

            <View style={styles.divider} />

            {/* Method */}
            <Text style={styles.sectionTitle}>Simplified Method</Text>
            {recipe.methodSteps.slice(0, METHOD_VISIBLE_COUNT).map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
            
            <Text style={styles.hintTextBack}>Tap to flip back</Text>
          </View>
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
          if (!isInMenu) {
            addSoundPlayer.seekTo(0);
            addSoundPlayer.play();
          }
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
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    resizeMode: 'cover',
  },
  heroImageFallback: {
    ...StyleSheet.absoluteFillObject,
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
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
    top: '50%',
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
  recipeDescription: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
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
  ingredientsListContainer: {
    maxHeight: INGREDIENT_ROW_HEIGHT * INGREDIENT_VISIBLE_COUNT,
    position: 'relative',
  },
  ingredientsScroll: {
    flexGrow: 0,
  },
  ingredientsScrollContent: {
    paddingBottom: Spacing.sm,
  },
  ingredientsFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: INGREDIENT_ROW_HEIGHT,
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
    lineHeight: 20,
    color: Colors.text,
  },
  ingredientQty: {
    fontSize: 15,
    lineHeight: 20,
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
