import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/context/AppContext';
import { Colors, Spacing, BorderRadius, CostTierInfo } from '@/constants/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();

  const updateHouseholdSize = (delta: number) => {
    const newSize = Math.max(1, Math.min(8, state.preferences.householdSize + delta));
    dispatch({
      type: 'SET_PREFERENCES',
      payload: { householdSize: newSize },
    });
    Haptics.selectionAsync();
  };

  const selectBudgetTier = (tier: number) => {
    dispatch({
      type: 'SET_PREFERENCES',
      payload: { defaultCostTier: tier },
    });
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Settings</Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Household Section */}
        <Text style={styles.sectionTitle}>Household</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="people-outline" size={22} color={Colors.primary} />
              <Text style={styles.rowLabel}>Household Size</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => updateHouseholdSize(-1)}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={state.preferences.householdSize > 1 ? Colors.primary : Colors.textTertiary}
                />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{state.preferences.householdSize}</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => updateHouseholdSize(1)}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={state.preferences.householdSize < 8 ? Colors.primary : Colors.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Budget Section */}
        <Text style={styles.sectionTitle}>Default Budget</Text>
        <View style={styles.card}>
          {[1, 2, 3, 4].map((tier, index) => (
            <TouchableOpacity
              key={tier}
              style={[
                styles.row,
                index < 3 && styles.rowBorder,
              ]}
              onPress={() => selectBudgetTier(tier)}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.tierSymbol}>{CostTierInfo[tier].symbol}</Text>
                <Text style={styles.rowLabel}>{CostTierInfo[tier].label}</Text>
              </View>
              {state.preferences.defaultCostTier === tier && (
                <Ionicons name="checkmark" size={22} color={Colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Shopping Section */}
        <Text style={styles.sectionTitle}>Shopping</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="storefront-outline" size={22} color={Colors.primary} />
              <Text style={styles.rowLabel}>Preferred Store</Text>
            </View>
            <Text style={styles.rowValue}>Tesco</Text>
          </View>
        </View>

        {/* About Section */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowLeft}>
              <Ionicons name="information-circle-outline" size={22} color={Colors.primary} />
              <Text style={styles.rowLabel}>Version</Text>
            </View>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
          
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://github.com')}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="logo-github" size={22} color={Colors.primary} />
              <Text style={styles.rowLabel}>GitHub</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Reset Section */}
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={() => {
            dispatch({ type: 'SET_PREFERENCES', payload: { hasCompletedOnboarding: false } });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }}
        >
          <Ionicons name="refresh-outline" size={20} color={Colors.error} />
          <Text style={styles.dangerButtonText}>Reset Onboarding</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          MealSwipe • React Native{'\n'}
          Built with Expo
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingTop: 0,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  rowValue: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  tierSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    width: 40,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    minWidth: 30,
    textAlign: 'center',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  dangerButtonText: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '500',
  },
  footer: {
    textAlign: 'center',
    color: Colors.textTertiary,
    fontSize: 13,
    marginTop: Spacing.xxl,
    lineHeight: 20,
  },
});
