import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { EmptyState } from '@/components/ui';
import { useApp } from '@/context/AppContext';
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

function getGradientColors(gradient?: string | null): [string, string] {
  if (!gradient) {
    return ['#FF6B35', '#ff8a5c'];
  }
  const match = gradient.match(/#[A-Fa-f0-9]{6}/);
  if (match && GRADIENT_COLORS[match[0]]) {
    return GRADIENT_COLORS[match[0]];
  }
  return ['#FF6B35', '#ff8a5c'];
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useApp();

  if (state.menu.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Your Menu</Text>
        <EmptyState
          icon="restaurant-outline"
          title="No meals selected yet"
          subtitle="Add recipes from the feed to build your cooking plan."
          action={{
            label: 'Browse recipes',
            onPress: () => router.push('/'),
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Your Menu</Text>
      <Text style={styles.subtitle}>
        {state.menu.length} meals ready for the week.
      </Text>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {state.menu.map(item => {
          const recipe = getRecipeById(item.recipeId);
          if (!recipe) return null;

          const gradientColors = getGradientColors(recipe.imageGradient);
          const totalTime = recipe.prepTimeMinutes + recipe.cookTimeMinutes;

          return (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => router.push(`/menu/${recipe.id}`)}
            >
              <LinearGradient colors={gradientColors} style={styles.cardIcon}>
                <Text style={styles.cardEmoji}>{recipe.icon}</Text>
              </LinearGradient>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {recipe.name}
                </Text>
                <View style={styles.cardMetaRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.cardMetaText}>{totalTime} mins</Text>
                  <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.cardMetaText}>{item.servings} servings</Text>
                </View>
                <Text style={styles.cardHint}>Tap to view recipe details</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.lg,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  cardMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginRight: Spacing.sm,
  },
  cardHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
});
