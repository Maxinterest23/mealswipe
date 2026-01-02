import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { getRecipeById } from '@/data/recipes';

export default function CookingModeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const recipeIdParam = Array.isArray(recipeId) ? recipeId[0] : recipeId;
  const recipe = recipeIdParam ? getRecipeById(recipeIdParam) : undefined;
  const [stepIndex, setStepIndex] = useState(0);

  if (!recipe) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Cooking mode unavailable</Text>
        <Text style={styles.subtitle}>Return to your menu and select a recipe.</Text>
      </View>
    );
  }

  const totalSteps = recipe.methodSteps.length;
  const currentStep = recipe.methodSteps[stepIndex];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.recipeName} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={styles.stepCount}>
            Step {stepIndex + 1} of {totalSteps}
          </Text>
        </View>
      </View>

      <View style={styles.stepCard}>
        <Text style={styles.stepText}>{currentStep}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlButton, stepIndex === 0 && styles.controlButtonDisabled]}
          onPress={() => setStepIndex(current => Math.max(0, current - 1))}
          disabled={stepIndex === 0}
        >
          <Ionicons name="arrow-back" size={20} color={stepIndex === 0 ? Colors.textTertiary : Colors.white} />
          <Text style={[styles.controlText, stepIndex === 0 && styles.controlTextDisabled]}>Previous</Text>
        </Pressable>

        <Pressable
          style={[
            styles.controlButton,
            styles.controlButtonPrimary,
            stepIndex === totalSteps - 1 && styles.controlButtonDisabled,
          ]}
          onPress={() => setStepIndex(current => Math.min(totalSteps - 1, current + 1))}
          disabled={stepIndex === totalSteps - 1}
        >
          <Text style={[styles.controlText, styles.controlTextPrimary]}>Next</Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color={stepIndex === totalSteps - 1 ? Colors.textTertiary : Colors.white}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  stepCount: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  stepCard: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.backgroundSecondary,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  stepText: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 30,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  controlButtonPrimary: {
    backgroundColor: Colors.primary,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  controlText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  controlTextPrimary: {
    color: Colors.white,
  },
  controlTextDisabled: {
    color: Colors.textTertiary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
