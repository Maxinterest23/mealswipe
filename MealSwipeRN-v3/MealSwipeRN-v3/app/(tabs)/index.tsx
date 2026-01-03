import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { filterRecipes } from '@/data/recipes';
import { getFeedPage } from '@/src/data/recipesProvider';
import { Colors, Spacing, BorderRadius, BadgeInfo, CostTierInfo } from '@/constants/theme';
import { Recipe } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = 10;

function mergeUniqueById(current: Recipe[], incoming: Recipe[]): Recipe[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map(item => item.id));
  const merged = [...current];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch, addToMenu, removeFromMenu, isInMenu } = useApp();
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Filter recipes
  const filteredRecipes = useMemo(
    () => filterRecipes(allRecipes, state.filters),
    [allRecipes, state.filters]
  );

  // Count active filters
  const activeFilterCount =
    (state.filters.costTiers.length < 4 ? 1 : 0) +
    state.filters.dietary.length;

  const handleAddToMenu = useCallback((recipeId: string) => {
    const alreadyInMenu = isInMenu(recipeId);

    if (alreadyInMenu) {
      removeFromMenu(recipeId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setToast({
        message: 'Removed from Menu',
        type: 'info',
      });
      setTimeout(() => setToast(null), 2000);
      return;
    }

    const added = addToMenu(recipeId);
    Haptics.impactAsync(
      added ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    );
    setToast({
      message: added ? 'Added to Menu!' : 'Already in Menu',
      type: added ? 'success' : 'info',
    });
    setTimeout(() => setToast(null), 2000);
  }, [addToMenu, isInMenu, removeFromMenu]);

  const loadInitialPage = useCallback(async () => {
    setIsFetching(true);
    try {
      const { items, nextCursor: newCursor } = await getFeedPage(null, PAGE_SIZE);
      setAllRecipes(items);
      setNextCursor(newCursor);
    } finally {
      setIsFetching(false);
      setHasLoadedOnce(true);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isFetching || !nextCursor) return;
    setIsFetching(true);
    try {
      const { items, nextCursor: newCursor } = await getFeedPage(nextCursor, PAGE_SIZE);
      setAllRecipes(current => mergeUniqueById(current, items));
      setNextCursor(newCursor);
    } finally {
      setIsFetching(false);
    }
  }, [isFetching, nextCursor]);

  useEffect(() => {
    loadInitialPage();
  }, [loadInitialPage]);

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

  if (hasLoadedOnce && filteredRecipes.length === 0) {
    const hasMore = Boolean(nextCursor);
    const emptyStateTitle = hasMore
      ? 'No matches yet'
      : 'No recipes match your filters';
    const emptyStateSubtitle = hasMore
      ? 'Try loading more recipes or adjust your filters'
      : 'Try adjusting your filters to see more recipes';
    const emptyStateAction = hasMore
      ? { label: 'Load More', onPress: loadMore }
      : { label: 'Reset Filters', onPress: resetFilters };

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <EmptyState
          icon="restaurant-outline"
          title={emptyStateTitle}
          subtitle={emptyStateSubtitle}
          action={emptyStateAction}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Recipe feed */}
      <FlatList
        data={filteredRecipes}
        keyExtractor={(item) => item.id}
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />

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
