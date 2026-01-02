// Type definitions for MealSwipe

export interface Ingredient {
  name: string;
  canonicalName: string;
  quantity: number;
  unit: string;
  category: string;
  price: number; // Estimated price in GBP
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export interface Recipe {
  id: string;
  name: string;
  imageGradient: string; // CSS gradient string
  icon: string; // Emoji
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  costTier: 1 | 2 | 3 | 4;
  badges: string[];
  ingredients: Ingredient[];
  nutrition: Nutrition;
  methodSteps: string[];
}

export interface MenuItem {
  id: string;
  recipeId: string;
  recipeName: string;
  servings: number;
  addedAt: Date;
}

export interface GroceryItem {
  id: string;
  ingredientName: string;
  canonicalName: string;
  quantity: number;
  unit: string;
  category: string;
  estimatedPrice: number;
  isChecked: boolean;
  isShared: boolean; // Used by multiple recipes
  sources: string[]; // Recipe names
}

export interface GroceryList {
  id: string;
  items: GroceryItem[];
  storeName: string;
  totalEstimateMin: number;
  totalEstimateMax: number;
  overlapSavings: number;
  createdAt: Date;
}

export interface FilterState {
  costTiers: number[];
  dietary: string[];
  maxCalories: number | null;
  minProtein: number | null;
}

export interface UserPreferences {
  hasCompletedOnboarding: boolean;
  dietaryPreferences: string[];
  allergies: string[];
  householdSize: number;
  defaultCostTier: number;
  preferredStoreId: string;
}

// Store type for price comparison
export interface Store {
  id: string;
  name: string;
  primaryColor: string;
  isOnlineEnabled: boolean;
  searchUrlTemplate: string;
}
