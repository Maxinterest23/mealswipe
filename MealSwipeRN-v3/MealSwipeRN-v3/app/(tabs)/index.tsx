import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  Text,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RecipeCard } from '@/components/RecipeCard';
import { Chip, Toast, EmptyState } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { mockRecipes, filterRecipes } from '@/data/recipes';
import { Colors, Spacing, BorderRadius, BadgeInfo, CostTierInfo } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch, addToMenu, isInMenu } = useApp();
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // Filter recipes
  const filteredRecipes = filterRecipes(mockRecipes, state.filters);

  // Count active filters
  const activeFilterCount =
    (state.filters.costTiers.length < 4 ? 1 : 0) +
    state.filters.dietary.length;

  const handleAddToMenu = useCallback((recipeId: string) => {
    const added = addToMenu(recipeId);
    Haptics.impactAsync(
      added ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
    setToast({
      message: added ? 'Added to Menu!' : 'Already in Menu',
      type: added ? 'success' : 'info',
    });
    setTimeout(() => setToast(null), 2000);
  }, [addToMenu]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const toggleCostTier = (tier: number) => {
    const current = state.filters.costTiers;
    const updated = current.includes(tier)
      ? current.filter(t => t !== tier)
      : [...current, tier];
    
    // Don't allow empty selection
    if (updated.length === 0) return;
    
    dispatch({
      type: 'SET_FILTERS',
      payload: { ...state.filters, costTiers: updated },
    });
    Haptics.selectionAsync();
  };

  const toggleDietary = (badge: string) => {
    const current = state.filters.dietary;
    const updated = current.includes(badge)
      ? current.filter(b => b !== badge)
      : [...current, badge];
    
    dispatch({
      type: 'SET_FILTERS',
      payload: { ...state.filters, dietary: updated },
    });
    Haptics.selectionAsync();
  };

  const resetFilters = () => {
    dispatch({ type: 'RESET_FILTERS' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  if (filteredRecipes.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="restaurant-outline"
          title="No recipes match your filters"
          subtitle="Try adjusting your filters to see more recipes"
          action={{ label: 'Reset Filters', onPress: resetFilters }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Recipe feed */}
      <FlatList
        ref={flatListRef}
        data={filteredRecipes}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            isInMenu={isInMenu(item.id)}
            onAddToMenu={() => handleAddToMenu(item.id)}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />

      {/* Recipe counter */}
      <View style={[styles.counter, { top: insets.top + 60 }]}>
        <Text style={styles.counterText}>
          {currentIndex + 1} / {filteredRecipes.length}
        </Text>
      </View>

      {/* Filter button */}
      <TouchableOpacity
        style={[styles.filterButton, { top: insets.top + 60 }]}
        onPress={() => setShowFilters(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="options-outline" size={22} color={Colors.white} />
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Budget */}
              <Text style={styles.filterSectionTitle}>Budget</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4].map(tier => (
                  <Chip
                    key={tier}
                    label={CostTierInfo[tier].symbol}
                    selected={state.filters.costTiers.includes(tier)}
                    onPress={() => toggleCostTier(tier)}
                  />
                ))}
              </View>

              {/* Dietary */}
              <Text style={styles.filterSectionTitle}>Dietary</Text>
              <View style={styles.chipRow}>
                {Object.entries(BadgeInfo).map(([key, info]) => (
                  <Chip
                    key={key}
                    label={`${info.icon} ${info.shortLabel}`}
                    selected={state.filters.dietary.includes(key)}
                    onPress={() => toggleDietary(key)}
                  />
                ))}
              </View>
            </ScrollView>

            {/* Reset button */}
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} visible={true} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  counter: {
    position: 'absolute',
    left: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  counterText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  filterButton: {
    position: 'absolute',
    right: Spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resetButton: {
    marginTop: Spacing.xl,
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  resetButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
