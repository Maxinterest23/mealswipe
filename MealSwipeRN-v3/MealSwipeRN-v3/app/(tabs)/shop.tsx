import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, EmptyState, Toast } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { getRecipeById } from '@/data/recipes';
import { stores } from '@/data/stores';
import { Colors, Spacing, BorderRadius, CategoryIcons } from '@/constants/theme';

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { state, removeFromMenu, updateServings, clearMenu, generateGroceryList, getMenuTotal, dispatch } = useApp();
  const [showGroceryList, setShowGroceryList] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const menuTotal = getMenuTotal();

  const handleGenerateList = () => {
    generateGroceryList();
    setShowGroceryList(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleClearMenu = () => {
    clearMenu();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setToast({ message: 'Basket cleared', type: 'info' });
    setTimeout(() => setToast(null), 2000);
  };

  const handleToggleGroceryItem = (id: string) => {
    dispatch({ type: 'TOGGLE_GROCERY_ITEM', payload: id });
    Haptics.selectionAsync();
  };

  const handleCopyList = async () => {
    const grouped = state.groceryList.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as Record<string, typeof state.groceryList>);

    let text = '🛒 MealSwipe Basket\n\n';
    Object.entries(grouped).forEach(([category, items]) => {
      text += `━━━ ${category} ━━━\n`;
      items.forEach(item => {
        text += `○ ${item.ingredientName} (${item.quantity} ${item.unit}) - £${item.estimatedPrice.toFixed(2)}\n`;
      });
      text += '\n';
    });

    const total = state.groceryList.reduce((sum, item) => sum + item.estimatedPrice, 0);
    text += `Estimated total: £${total.toFixed(2)}`;

    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToast({ message: 'Copied to clipboard!', type: 'success' });
    setTimeout(() => setToast(null), 2000);
  };

  const preferredStore = stores.find(store => store.id === state.preferences.preferredStoreId) ?? stores[0];

  const handleShopStore = () => {
    Linking.openURL(preferredStore.searchUrlTemplate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Empty state
  if (state.menu.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>This Week's Basket</Text>
        <EmptyState
          icon="restaurant-outline"
          title="Your basket is empty"
          subtitle="Swipe through recipes and tap + to add them to your basket"
        />
        {toast && <Toast message={toast.message} type={toast.type} visible={true} />}
      </View>
    );
  }

  // Group grocery items by category
  const groupedGroceries = state.groceryList.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, typeof state.groceryList>);

  const groceryTotal = state.groceryList.reduce((sum, item) => sum + item.estimatedPrice, 0);
  const packOptimizedTotal = state.groceryList.reduce(
    (sum, item) => sum + (item.packCost ?? item.estimatedPrice),
    0
  );
  const packOptimizationDelta = packOptimizedTotal - groceryTotal;
  const checkedCount = state.groceryList.filter(item => item.isChecked).length;
  const overlapSavings = state.groceryList.reduce(
    (sum, item) => sum + (item.isShared ? item.estimatedPrice * 0.1 : 0),
    0
  );

  const storePriceModifiers: Record<string, number> = {
    tesco: 1,
    sainsburys: 1.03,
    asda: 0.97,
    waitrose: 1.08,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>This Week's Basket</Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cost Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Basket estimate</Text>
              <Text style={styles.summaryValue}>
                £{menuTotal.min.toFixed(2)} - £{menuTotal.max.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>Recipes</Text>
              <Text style={[styles.summaryValue, { color: Colors.primary }]}>
                {state.menu.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        {state.menu.map(item => {
          const recipe = getRecipeById(item.recipeId);
          if (!recipe) return null;

          const recipeTotal = recipe.ingredients.reduce((sum, ing) => sum + ing.price, 0);
          const scaledTotal = recipeTotal * (item.servings / recipe.servings);

          return (
            <View key={item.id} style={styles.menuItem}>
              <LinearGradient
                colors={['#FF6B35', '#ff8a5c']}
                style={styles.thumbnail}
              >
                <Text style={styles.thumbnailIcon}>{recipe.icon}</Text>
              </LinearGradient>

              <View style={styles.menuItemInfo}>
                <Text style={styles.menuItemName} numberOfLines={1}>
                  {recipe.name}
                </Text>

                <View style={styles.servingsRow}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      if (item.servings > 1) {
                        updateServings(item.recipeId, item.servings - 1);
                        Haptics.selectionAsync();
                      }
                    }}
                  >
                    <Ionicons
                      name="remove"
                      size={16}
                      color={item.servings > 1 ? Colors.primary : Colors.textTertiary}
                    />
                  </TouchableOpacity>

                  <Text style={styles.servingsText}>{item.servings} servings</Text>

                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => {
                      if (item.servings < 8) {
                        updateServings(item.recipeId, item.servings + 1);
                        Haptics.selectionAsync();
                      }
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={16}
                      color={item.servings < 8 ? Colors.primary : Colors.textTertiary}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.menuItemPrice}>£{scaledTotal.toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => {
                  removeFromMenu(item.recipeId);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons name="close-circle" size={24} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Build Basket Button */}
        <Button
          title="Build Basket"
          icon="cart"
          onPress={handleGenerateList}
          style={{ marginTop: Spacing.lg }}
        />

        {/* Clear Basket Button */}
        <Button
          title="Clear Basket"
          icon="trash-outline"
          variant="danger"
          onPress={handleClearMenu}
          style={{ marginTop: Spacing.sm }}
        />
      </ScrollView>

      {/* Basket Modal */}
      <Modal
        visible={showGroceryList}
        animationType="slide"
        onRequestClose={() => setShowGroceryList(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowGroceryList(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Basket</Text>
            <TouchableOpacity onPress={handleCopyList}>
              <Ionicons name="copy-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Summary Card */}
          <LinearGradient
            colors={[Colors.tescoBlue, '#003d73']}
            style={styles.grocerySummary}
          >
            <Text style={styles.grocerySummaryLabel}>Estimated Basket Total</Text>
            <Text style={styles.grocerySummaryValue}>
              £{(groceryTotal * 0.95).toFixed(2)} - £{(groceryTotal * 1.05).toFixed(2)}
            </Text>
            <View style={styles.groceryStatsRow}>
              <View style={styles.groceryStat}>
                <Text style={styles.groceryStatValue}>{state.groceryList.length}</Text>
                <Text style={styles.groceryStatLabel}>Ingredients</Text>
              </View>
              <View style={styles.groceryStat}>
                <Text style={styles.groceryStatValue}>{checkedCount}</Text>
                <Text style={styles.groceryStatLabel}>In basket</Text>
              </View>
              <View style={styles.groceryStat}>
                <Text style={styles.groceryStatValue}>£{overlapSavings.toFixed(2)}</Text>
                <Text style={styles.groceryStatLabel}>Overlap savings</Text>
              </View>
            </View>
            <View style={styles.grocerySummaryRow}>
              <Text style={styles.grocerySummaryRowLabel}>Pack size optimization</Text>
              <Text style={styles.grocerySummaryRowValue}>
                {packOptimizationDelta >= 0 ? '+' : '-'}£{Math.abs(packOptimizationDelta).toFixed(2)}
              </Text>
            </View>
            {/* Progress bar */}
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(checkedCount / state.groceryList.length) * 100}%` },
                ]}
              />
            </View>
          </LinearGradient>

          <View style={styles.storeComparisonCard}>
            <Text style={styles.storeComparisonTitle}>Supermarket comparison</Text>
            {stores.map(store => {
              const modifier = storePriceModifiers[store.id] ?? 1;
              const storeTotal = groceryTotal * modifier;
              const isPreferred = store.id === state.preferences.preferredStoreId;
              return (
                <View
                  key={store.id}
                  style={[
                    styles.storeComparisonRow,
                    isPreferred && styles.storeComparisonRowPreferred,
                    { borderColor: store.primaryColor },
                  ]}
                >
                  <View style={styles.storeComparisonInfo}>
                    <Text style={styles.storeComparisonName}>{store.name}</Text>
                    {isPreferred && (
                      <Text style={styles.preferredBadge}>Preferred</Text>
                    )}
                  </View>
                  <Text style={styles.storeComparisonTotal}>
                    £{(storeTotal * 0.95).toFixed(2)} - £{(storeTotal * 1.05).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Basket Items */}
          <ScrollView style={styles.groceryScroll} showsVerticalScrollIndicator={false}>
            {Object.entries(groupedGroceries).map(([category, items]) => (
              <View key={category} style={styles.groceryCategory}>
                <View style={styles.groceryCategoryHeader}>
                  <Text style={styles.groceryCategoryIcon}>
                    {CategoryIcons[category] || '📦'}
                  </Text>
                  <Text style={styles.groceryCategoryTitle}>{category}</Text>
                  <View style={styles.groceryCategoryBadge}>
                    <Text style={styles.groceryCategoryCount}>{items.length}</Text>
                  </View>
                </View>

                <View style={styles.groceryItemsContainer}>
                  {items.map((item, index) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.groceryItem,
                        index < items.length - 1 && styles.groceryItemBorder,
                      ]}
                      onPress={() => handleToggleGroceryItem(item.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          item.isChecked && styles.checkboxChecked,
                        ]}
                      >
                        {item.isChecked && (
                          <Ionicons name="checkmark" size={14} color={Colors.white} />
                        )}
                      </View>

                      <View style={styles.groceryItemInfo}>
                        <Text
                          style={[
                            styles.groceryItemName,
                            item.isChecked && styles.groceryItemNameChecked,
                          ]}
                        >
                          {item.ingredientName}
                          {item.isShared && (
                            <Text style={styles.sharedBadge}> SHARED</Text>
                          )}
                        </Text>
                        <Text style={styles.groceryItemQty}>
                          {Math.round(item.quantity)} {item.unit}
                        </Text>
                      </View>

                      <Text style={styles.groceryItemPrice}>
                        £{item.estimatedPrice.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Shop Button */}
          <View style={[styles.shopButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.shopButton} onPress={handleShopStore}>
              <Ionicons name="cart" size={20} color={Colors.white} />
              <Text style={styles.shopButtonText}>Shop at {preferredStore.name}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} visible={true} />}
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
  summaryCard: {
    backgroundColor: Colors.backgroundSecondary,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: {
    fontSize: 28,
  },
  menuItemInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.sm,
    width: 80,
    textAlign: 'center',
  },
  menuItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  removeButton: {
    padding: Spacing.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  grocerySummary: {
    margin: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  grocerySummaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  grocerySummaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
    marginVertical: Spacing.sm,
  },
  groceryStatsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  groceryStat: {
    flex: 1,
  },
  groceryStatValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
  },
  groceryStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  grocerySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  grocerySummaryRowLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  grocerySummaryRowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
  },
  groceryScroll: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  storeComparisonCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundSecondary,
  },
  storeComparisonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  storeComparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
  },
  storeComparisonRowPreferred: {
    backgroundColor: Colors.background,
  },
  storeComparisonInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  storeComparisonName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  preferredBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  storeComparisonTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  groceryCategory: {
    marginBottom: Spacing.lg,
  },
  groceryCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  groceryCategoryIcon: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  groceryCategoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  groceryCategoryBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
  },
  groceryCategoryCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  groceryItemsContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
  },
  groceryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  groceryItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  groceryItemInfo: {
    flex: 1,
  },
  groceryItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  groceryItemNameChecked: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  sharedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  groceryItemQty: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  groceryItemPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  shopButtonContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  shopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tescoBlue,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  shopButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
