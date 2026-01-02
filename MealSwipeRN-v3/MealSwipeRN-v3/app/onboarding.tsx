import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/context/AppContext';

const Colors = {
  primary: '#FF6B35',
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  text: '#1A1A1A',
  textSecondary: '#666666',
  white: '#FFFFFF',
  border: '#EEEEEE',
};

const BadgeInfo: Record<string, { icon: string; label: string }> = {
  vegetarian: { icon: '🌱', label: 'Vegetarian' },
  vegan: { icon: '🌿', label: 'Vegan' },
  keto: { icon: '🥑', label: 'Keto' },
  glutenFree: { icon: '🌾', label: 'Gluten Free' },
  dairyFree: { icon: '🥛', label: 'Dairy Free' },
  nutFree: { icon: '🥜', label: 'Nut Free' },
  halal: { icon: '☪️', label: 'Halal' },
};

const CostTierInfo: Record<number, { symbol: string; label: string }> = {
  1: { symbol: '£', label: 'Budget' },
  2: { symbol: '££', label: 'Moderate' },
  3: { symbol: '£££', label: 'Premium' },
  4: { symbol: '££££', label: 'Luxury' },
};

type Step = 'welcome' | 'dietary' | 'allergies' | 'household' | 'budget';
const STEPS: Step[] = ['welcome', 'dietary', 'allergies', 'household', 'budget'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { dispatch } = useApp();
  
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [householdSize, setHouseholdSize] = useState(2);
  const [budgetTier, setBudgetTier] = useState(2);

  const stepIndex = STEPS.indexOf(currentStep);
  const progress = stepIndex / (STEPS.length - 1);

  const nextStep = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const completeOnboarding = () => {
    dispatch({
      type: 'SET_PREFERENCES',
      payload: {
        hasCompletedOnboarding: true,
        dietaryPreferences,
        allergies,
        householdSize,
        defaultCostTier: budgetTier,
      },
    });
    router.replace('/(tabs)');
  };

  const toggleDietary = (badge: string) => {
    setDietaryPreferences(prev =>
      prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
    );
  };

  const toggleAllergy = (badge: string) => {
    setAllergies(prev =>
      prev.includes(badge) ? prev.filter(b => b !== badge) : [...prev, badge]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <View style={styles.stepContent}>
            <Text style={styles.welcomeIcon}>🍽️</Text>
            <Text style={styles.title}>Welcome to MealSwipe</Text>
            <Text style={styles.subtitle}>
              Discover recipes you'll love, plan your week, and shop smarter
            </Text>

            <View style={styles.features}>
              <FeatureRow icon="hand-left-outline" title="Swipe to discover" subtitle="Find recipes in seconds" />
              <FeatureRow icon="restaurant-outline" title="Build your menu" subtitle="Plan the perfect week" />
              <FeatureRow icon="cart-outline" title="Shop smart" subtitle="Get the best prices" />
            </View>
          </View>
        )}

        {/* Dietary Step */}
        {currentStep === 'dietary' && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Dietary Preferences</Text>
            <Text style={styles.subtitle}>Select any that apply to you</Text>
            <View style={styles.optionsList}>
              {['vegetarian', 'vegan', 'keto'].map(badge => (
                <ToggleChip
                  key={badge}
                  icon={BadgeInfo[badge].icon}
                  label={BadgeInfo[badge].label}
                  selected={dietaryPreferences.includes(badge)}
                  onPress={() => toggleDietary(badge)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Allergies Step */}
        {currentStep === 'allergies' && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Allergies & Restrictions</Text>
            <Text style={styles.subtitle}>We'll filter recipes to match</Text>
            <View style={styles.optionsList}>
              {['glutenFree', 'dairyFree', 'nutFree', 'halal'].map(badge => (
                <ToggleChip
                  key={badge}
                  icon={BadgeInfo[badge].icon}
                  label={BadgeInfo[badge].label}
                  selected={allergies.includes(badge)}
                  onPress={() => toggleAllergy(badge)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Household Step */}
        {currentStep === 'household' && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Household Size</Text>
            <Text style={styles.subtitle}>We'll adjust portions and costs</Text>
            <View style={styles.householdPicker}>
              <TouchableOpacity
                onPress={() => householdSize > 1 && setHouseholdSize(householdSize - 1)}
              >
                <Ionicons name="remove-circle" size={44} color={householdSize > 1 ? Colors.primary : '#ccc'} />
              </TouchableOpacity>
              <View style={styles.householdValue}>
                <Text style={styles.householdNumber}>{householdSize}</Text>
                <Text style={styles.householdLabel}>{householdSize === 1 ? 'person' : 'people'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => householdSize < 8 && setHouseholdSize(householdSize + 1)}
              >
                <Ionicons name="add-circle" size={44} color={householdSize < 8 ? Colors.primary : '#ccc'} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Budget Step */}
        {currentStep === 'budget' && (
          <View style={styles.stepContent}>
            <Text style={styles.title}>Weekly Budget</Text>
            <Text style={styles.subtitle}>Set your default price range</Text>
            <View style={styles.optionsList}>
              {[1, 2, 3, 4].map(tier => (
                <TouchableOpacity
                  key={tier}
                  style={[styles.budgetOption, budgetTier === tier && styles.budgetOptionSelected]}
                  onPress={() => setBudgetTier(tier)}
                >
                  <Text style={[styles.budgetSymbol, budgetTier === tier && styles.budgetSymbolSelected]}>
                    {CostTierInfo[tier].symbol}
                  </Text>
                  <Text style={[styles.budgetLabel, budgetTier === tier && styles.budgetLabelSelected]}>
                    {CostTierInfo[tier].label}
                  </Text>
                  {budgetTier === tier && <Ionicons name="checkmark-circle" size={22} color={Colors.white} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.button}
          onPress={currentStep === 'budget' ? completeOnboarding : nextStep}
        >
          <Text style={styles.buttonText}>
            {currentStep === 'budget' ? 'Start Swiping' : 'Continue'}
          </Text>
        </TouchableOpacity>
        
        {(currentStep === 'dietary' || currentStep === 'allergies') && (
          <TouchableOpacity style={styles.skipButton} onPress={nextStep}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function FeatureRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={24} color={Colors.primary} />
      </View>
      <View>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ToggleChip({ icon, label, selected, onPress }: { icon: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.toggleChip, selected && styles.toggleChipSelected]}
      onPress={onPress}
    >
      <Text style={styles.toggleChipIcon}>{icon}</Text>
      <Text style={[styles.toggleChipLabel, selected && styles.toggleChipLabelSelected]}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.white} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  progressContainer: { paddingHorizontal: 24, paddingTop: 8 },
  progressBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  content: { flex: 1 },
  contentContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  stepContent: { alignItems: 'center' },
  welcomeIcon: { fontSize: 80, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  features: { width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  featureIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  featureTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  featureSubtitle: { fontSize: 14, color: Colors.textSecondary },
  optionsList: { width: '100%' },
  toggleChip: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, marginBottom: 8 },
  toggleChipSelected: { backgroundColor: Colors.primary },
  toggleChipIcon: { fontSize: 24, marginRight: 12 },
  toggleChipLabel: { flex: 1, fontSize: 16, color: Colors.text },
  toggleChipLabelSelected: { color: Colors.white },
  householdPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  householdValue: { alignItems: 'center', minWidth: 100 },
  householdNumber: { fontSize: 64, fontWeight: '700', color: Colors.text },
  householdLabel: { fontSize: 16, color: Colors.textSecondary },
  budgetOption: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, marginBottom: 8 },
  budgetOptionSelected: { backgroundColor: Colors.primary },
  budgetSymbol: { fontSize: 18, fontWeight: '700', color: Colors.primary, marginRight: 12, minWidth: 50 },
  budgetSymbolSelected: { color: Colors.white },
  budgetLabel: { flex: 1, fontSize: 16, color: Colors.text },
  budgetLabelSelected: { color: Colors.white },
  bottomContainer: { padding: 24 },
  button: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  skipButton: { alignItems: 'center', padding: 12, marginTop: 8 },
  skipButtonText: { fontSize: 16, color: Colors.textSecondary },
});
