// Design Tokens for MealSwipe
export const Colors = {
  primary: '#FF6B35',
  secondary: '#004E64',
  success: '#2EC4B6',
  warning: '#FFB627',
  error: '#E63946',
  
  // Cost tiers
  costBudget: '#22C55E',
  costModerate: '#3B82F6',
  costPremium: '#F59E0B',
  costLuxury: '#EF4444',
  
  // Store colors
  tescoBlue: '#00539F',
  sainsburysOrange: '#F06C00',
  asdaGreen: '#78BE20',
  
  // Neutrals
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  text: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#999999',
  border: '#EEEEEE',
  
  // Semantic
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700' as const,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 17,
    fontWeight: '400' as const,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400' as const,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
};

// Cost tier display info
export const CostTierInfo: Record<number, { symbol: string; label: string; color: string }> = {
  1: { symbol: '£', label: 'Budget', color: Colors.costBudget },
  2: { symbol: '££', label: 'Moderate', color: Colors.costModerate },
  3: { symbol: '£££', label: 'Premium', color: Colors.costPremium },
  4: { symbol: '££££', label: 'Luxury', color: Colors.costLuxury },
};

// Badge display info
export const BadgeInfo: Record<string, { icon: string; label: string; shortLabel: string }> = {
  vegetarian: { icon: '🌱', label: 'Vegetarian', shortLabel: 'Veggie' },
  vegan: { icon: '🌿', label: 'Vegan', shortLabel: 'Vegan' },
  glutenFree: { icon: '🌾', label: 'Gluten Free', shortLabel: 'GF' },
  dairyFree: { icon: '🥛', label: 'Dairy Free', shortLabel: 'DF' },
  nutFree: { icon: '🥜', label: 'Nut Free', shortLabel: 'NF' },
  halal: { icon: '☪️', label: 'Halal', shortLabel: 'Halal' },
  highProtein: { icon: '💪', label: 'High Protein', shortLabel: 'Protein' },
  lowCalorie: { icon: '🔥', label: 'Low Calorie', shortLabel: 'Low Cal' },
  keto: { icon: '🥑', label: 'Keto', shortLabel: 'Keto' },
};

// Category icons
export const CategoryIcons: Record<string, string> = {
  'Proteins': '🥩',
  'Dairy & Eggs': '🥛',
  'Produce': '🥬',
  'Grains & Pasta': '🍝',
  'Canned & Jarred': '🥫',
  'Condiments & Sauces': '🫙',
  'Spices & Seasonings': '🧂',
  'Bakery': '🍞',
  'Frozen': '🧊',
  'Beverages': '🥤',
  'Other': '📦',
};
