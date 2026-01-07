import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Linking,
  Share,
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
import { usePriceQuotes } from '@/src/features/shop/usePriceQuotes';
import type { QuoteResponse } from '@/src/api/quoteClient';

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { state, removeFromMenu, updateServings, clearMenu, generateGroceryList, getMenuTotal, dispatch } = useApp();
  const [showGroceryList, setShowGroceryList] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const { quotes, isLoading: quoteLoading, error: quoteError, isFallback } = usePriceQuotes(state.menu);

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
        text += `○ ${item.ingredientName} (${item.quantity} ${item.unit})\n`;
      });
      text += '\n';
    });

    await Clipboard.setStringAsync(text);
    let shareOpened = false;
    try {
      await Share.share(
        { message: text, title: 'MealSwipe Basket' },
        { dialogTitle: 'Paste into Notepad' }
      );
      shareOpened = true;
    } catch (error) {
      shareOpened = false;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToast({
      message: shareOpened ? 'Copied. Choose Notepad to paste.' : 'Copied to clipboard!',
      type: 'success',
    });
    setTimeout(() => setToast(null), 2000);
  };

  const selectedStore = useMemo(
    () => (selectedStoreId ? stores.find(store => store.id === selectedStoreId) ?? null : null),
    [selectedStoreId]
  );
  const canShop = Boolean(selectedStore);
  const shopButtonLabel = selectedStore ? `Shop at ${selectedStore.name}` : 'Select a store to shop';

  const handleShopStore = () => {
    if (!selectedStore) {
      setToast({ message: 'Select a store to shop', type: 'info' });
      setTimeout(() => setToast(null), 2000);
      return;
    }
    Linking.openURL(selectedStore.searchUrlTemplate);
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
    morrisons: 1.01,
    waitrose: 1.08,
  };

  const quoteByStore = useMemo(() => {
    const map = new Map<string, QuoteResponse['quotes'][number]>();
    quotes?.quotes?.forEach(quote => map.set(quote.store, quote));
    return map;
  }, [quotes]);
  const hasQuoteData = Boolean(quotes?.quotes?.length) && !isFallback;
  const anyMissingItems = hasQuoteData && quotes?.quotes?.some(quote => quote.missingCount > 0);
  const selectedQuote = selectedStoreId ? quoteByStore.get(selectedStoreId) : null;
  const sortedLineItems = selectedQuote?.lineItems
    ? [...selectedQuote.lineItems].sort((a, b) => b.lineTotal - a.lineTotal)
    : [];

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
            <Text style={styles.grocerySummaryLabel}>
              {hasQuoteData ? 'Estimated Basket Total' : 'Local Basket Estimate'}
            </Text>
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

          {anyMissingItems && (
            <View style={styles.missingBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.warning} />
              <Text style={styles.missingBannerText}>
                Some items could not be priced yet. Totals are estimates.
              </Text>
            </View>
          )}

          {(quoteLoading || quoteError) && (
            <View style={styles.quoteStatusRow}>
              <Text style={styles.quoteStatusText}>
                {quoteLoading ? 'Updating store prices...' : 'Using local estimate for now.'}
              </Text>
            </View>
          )}

          <View style={styles.storeComparisonCard}>
            <Text style={styles.storeComparisonTitle}>Supermarket comparison</Text>
            {stores.map(store => {
              const modifier = storePriceModifiers[store.id] ?? 1;
              const storeTotal = groceryTotal * modifier;
              const quote = hasQuoteData ? quoteByStore.get(store.id) : null;
              return (
                <TouchableOpacity
                  key={store.id}
                  style={[
                    styles.storeComparisonRow,
                    { borderColor: store.primaryColor },
                  ]}
                  onPress={() => setSelectedStoreId(store.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.storeComparisonInfo}>
                    <Text style={styles.storeComparisonName}>{store.name}</Text>
                    {quote?.missingCount ? (
                      <View style={styles.missingBadge}>
                        <Text style={styles.missingBadgeText}>
                          Missing {quote.missingCount}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.storeComparisonTotals}>
                    {quote ? (
                      <>
                        <Text style={styles.storeComparisonTotal}>
                          £{quote.basketTotal.toFixed(2)} est
                        </Text>
                        <Text style={styles.storeComparisonSubTotal}>
                          £{quote.consumedEstimate.toFixed(2)} consumed
                        </Text>
                        <Text style={styles.storeComparisonMeta}>
                          Updated {new Date(quote.lastUpdated).toLocaleString()}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.storeComparisonTotal}>
                          £{(storeTotal * 0.95).toFixed(2)} - £{(storeTotal * 1.05).toFixed(2)}
                        </Text>
                        <Text style={styles.storeComparisonMeta}>Local estimate</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedQuote && (
            <View style={styles.storeDetailCard}>
              <Text style={styles.storeDetailTitle}>
                {stores.find(store => store.id === selectedQuote.store)?.name ?? selectedQuote.store} details
              </Text>
              <Text style={styles.storeDetailSubtitle}>Line items (estimate)</Text>
              {sortedLineItems.map(item => (
                <View key={item.storeProductId} style={styles.lineItemRow}>
                  <View style={styles.lineItemInfo}>
                    <Text style={styles.lineItemTitle} numberOfLines={1}>{item.productTitle}</Text>
                    <Text style={styles.lineItemMeta}>
                      {item.packsNeeded} x {item.packSize.value} {item.packSize.unit}
                    </Text>
                  </View>
                  <Text style={styles.lineItemTotal}>£{item.lineTotal.toFixed(2)}</Text>
                </View>
              ))}
              {selectedQuote.missingItems.length > 0 && (
                <View style={styles.missingList}>
                  <Text style={styles.missingListTitle}>Missing items</Text>
                  {selectedQuote.missingItems.map((missing, index) => (
                    <Text key={`${missing.ingredientName}-${index}`} style={styles.missingListItem}>
                      {missing.ingredientName} ({missing.reason})
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

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
            <TouchableOpacity
              style={[styles.shopButton, !canShop && styles.shopButtonDisabled]}
              onPress={handleShopStore}
              disabled={!canShop}
            >
              <Ionicons name="cart" size={20} color={canShop ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.shopButtonText, !canShop && styles.shopButtonTextDisabled]}>
                {shopButtonLabel}
              </Text>
              <Ionicons name="open-outline" size={16} color={canShop ? Colors.white : Colors.textSecondary} />
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
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
  },
  storeComparisonInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
  },
  storeComparisonTotals: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: 170,
  },
  storeComparisonName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  storeComparisonTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  storeComparisonSubTotal: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  storeComparisonMeta: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  missingBadge: {
    backgroundColor: `${Colors.warning}20`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  missingBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.warning,
  },
  missingBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: `${Colors.warning}10`,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  missingBannerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  quoteStatusRow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  quoteStatusText: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  storeDetailCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.backgroundSecondary,
  },
  storeDetailTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  storeDetailSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineItemInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  lineItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  lineItemMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  lineItemTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  missingList: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  missingListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  missingListItem: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
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
  shopButtonDisabled: {
    backgroundColor: Colors.border,
  },
  shopButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  shopButtonTextDisabled: {
    color: Colors.textSecondary,
  },
});
