import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MenuItem, FilterState, UserPreferences, GroceryItem } from '@/types';
import { getRecipeById } from '@/data/recipes';
import { packSizeHints } from '@/data/packSizes';

// State type
interface AppState {
  menu: MenuItem[];
  filters: FilterState;
  preferences: UserPreferences;
  groceryList: GroceryItem[];
  isLoading: boolean;
}

// Action types
type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ADD_TO_MENU'; payload: MenuItem }
  | { type: 'REMOVE_FROM_MENU'; payload: string }
  | { type: 'UPDATE_SERVINGS'; payload: { recipeId: string; servings: number } }
  | { type: 'CLEAR_MENU' }
  | { type: 'SET_FILTERS'; payload: FilterState }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_PREFERENCES'; payload: Partial<UserPreferences> }
  | { type: 'COMPLETE_ONBOARDING' }
  | { type: 'SET_GROCERY_LIST'; payload: GroceryItem[] }
  | { type: 'TOGGLE_GROCERY_ITEM'; payload: string }
  | { type: 'LOAD_STATE'; payload: Partial<AppState> };

// Initial state
const initialState: AppState = {
  menu: [],
  filters: {
    costTiers: [1, 2, 3, 4],
    dietary: [],
    maxCalories: null,
    minProtein: null,
  },
  preferences: {
    hasCompletedOnboarding: false,
    dietaryPreferences: [],
    allergies: [],
    householdSize: 2,
    defaultCostTier: 2,
  },
  groceryList: [],
  isLoading: true,
};

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
      
    case 'ADD_TO_MENU':
      // Check if already in menu
      if (state.menu.some(item => item.recipeId === action.payload.recipeId)) {
        return state;
      }
      return { ...state, menu: [...state.menu, action.payload] };
      
    case 'REMOVE_FROM_MENU':
      return {
        ...state,
        menu: state.menu.filter(item => item.recipeId !== action.payload),
      };
      
    case 'UPDATE_SERVINGS':
      return {
        ...state,
        menu: state.menu.map(item =>
          item.recipeId === action.payload.recipeId
            ? { ...item, servings: action.payload.servings }
            : item
        ),
      };
      
    case 'CLEAR_MENU':
      return { ...state, menu: [], groceryList: [] };
      
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
      
    case 'RESET_FILTERS':
      return {
        ...state,
        filters: {
          costTiers: [1, 2, 3, 4],
          dietary: [],
          maxCalories: null,
          minProtein: null,
        },
      };
      
    case 'SET_PREFERENCES':
      return {
        ...state,
        preferences: { ...state.preferences, ...action.payload },
      };
      
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        preferences: { ...state.preferences, hasCompletedOnboarding: true },
      };
      
    case 'SET_GROCERY_LIST':
      return { ...state, groceryList: action.payload };
      
    case 'TOGGLE_GROCERY_ITEM':
      return {
        ...state,
        groceryList: state.groceryList.map(item =>
          item.id === action.payload ? { ...item, isChecked: !item.isChecked } : item
        ),
      };
      
    case 'LOAD_STATE':
      return { ...state, ...action.payload, isLoading: false };
      
    default:
      return state;
  }
}

// Context
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Helper functions
  addToMenu: (recipeId: string) => boolean;
  removeFromMenu: (recipeId: string) => void;
  updateServings: (recipeId: string, servings: number) => void;
  clearMenu: () => void;
  isInMenu: (recipeId: string) => boolean;
  generateGroceryList: () => void;
  getMenuTotal: () => { min: number; max: number };
}

const AppContext = createContext<AppContextType | null>(null);

// Storage keys
const STORAGE_KEYS = {
  MENU: '@mealswipe_menu',
  PREFERENCES: '@mealswipe_preferences',
  FILTERS: '@mealswipe_filters',
};

// Provider component
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    loadPersistedState();
  }, []);

  // Persist state changes
  useEffect(() => {
    if (!state.isLoading) {
      persistState();
    }
  }, [state.menu, state.preferences, state.filters]);

  async function loadPersistedState() {
    try {
      const [menuJson, preferencesJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.MENU),
        AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
      ]);

      const loadedState: Partial<AppState> = {};
      const storedPreferences = preferencesJson
        ? {
            ...initialState.preferences,
            ...JSON.parse(preferencesJson),
          }
        : initialState.preferences;

      if (preferencesJson) {
        loadedState.preferences = storedPreferences;
      }
      if (menuJson && storedPreferences.hasCompletedOnboarding) {
        const parsedMenu = JSON.parse(menuJson);
        if (Array.isArray(parsedMenu)) {
          loadedState.menu = parsedMenu;
        }
      }

      dispatch({ type: 'LOAD_STATE', payload: loadedState });
    } catch (error) {
      console.error('Error loading state:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }

  async function persistState() {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(state.menu)),
        AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(state.preferences)),
      ]);
    } catch (error) {
      console.error('Error persisting state:', error);
    }
  }

  // Helper functions
  function addToMenu(recipeId: string): boolean {
    if (state.menu.some(item => item.recipeId === recipeId)) {
      return false; // Already in menu
    }

    const recipe = getRecipeById(recipeId);
    if (!recipe) return false;

    const menuItem: MenuItem = {
      id: `menu_${Date.now()}`,
      recipeId,
      recipeName: recipe.name,
      servings: state.preferences.householdSize,
      addedAt: new Date(),
    };

    dispatch({ type: 'ADD_TO_MENU', payload: menuItem });
    return true;
  }

  function removeFromMenu(recipeId: string) {
    dispatch({ type: 'REMOVE_FROM_MENU', payload: recipeId });
  }

  function updateServings(recipeId: string, servings: number) {
    dispatch({ type: 'UPDATE_SERVINGS', payload: { recipeId, servings } });
  }

  function clearMenu() {
    dispatch({ type: 'CLEAR_MENU' });
  }

  function isInMenu(recipeId: string): boolean {
    return state.menu.some(item => item.recipeId === recipeId);
  }

  function generateGroceryList() {
    const aggregated: Record<string, GroceryItem> = {};

    state.menu.forEach(menuItem => {
      const recipe = getRecipeById(menuItem.recipeId);
      if (!recipe) return;

      const scale = menuItem.servings / recipe.servings;

      recipe.ingredients.forEach(ing => {
        const rawName = typeof ing.canonicalName === 'string' ? ing.canonicalName : ing.name;
        if (!rawName) return;
        const key = rawName.toLowerCase();

        if (!aggregated[key]) {
          aggregated[key] = {
            id: `grocery_${key}`,
            ingredientName: ing.name ?? rawName,
            canonicalName: rawName,
            quantity: 0,
            unit: ing.unit ?? 'piece',
            category: ing.category ?? 'Uncategorized',
            estimatedPrice: 0,
            isChecked: false,
            isShared: false,
            sources: [],
          };
        }

        const quantity = Number(ing.quantity);
        const price = Number(ing.price);
        if (Number.isFinite(quantity)) {
          aggregated[key].quantity += quantity * scale;
        }
        if (Number.isFinite(price)) {
          aggregated[key].estimatedPrice += price * scale;
        }
        
        if (!aggregated[key].sources.includes(recipe.name)) {
          aggregated[key].sources.push(recipe.name);
        }
        
        if (aggregated[key].sources.length > 1) {
          aggregated[key].isShared = true;
        }
      });
    });

    const groceryList = Object.values(aggregated).map(item => {
      const packHint = packSizeHints[item.canonicalName];
      if (!packHint || packHint.unit !== item.unit) {
        return item;
      }

      const packCount = Math.ceil(item.quantity / packHint.packSize);
      const packCost = packCount * packHint.packPrice;

      return {
        ...item,
        packSize: packHint.packSize,
        packPrice: packHint.packPrice,
        packCount,
        packCost,
      };
    });
    dispatch({ type: 'SET_GROCERY_LIST', payload: groceryList });
  }

  function getMenuTotal(): { min: number; max: number } {
    let total = 0;

    state.menu.forEach(menuItem => {
      const recipe = getRecipeById(menuItem.recipeId);
      if (!recipe) return;

      const scale = menuItem.servings / recipe.servings;
      const recipeTotal = recipe.ingredients.reduce((sum, ing) => sum + ing.price, 0);
      total += recipeTotal * scale;
    });

    // Add 5% variance for min/max
    return {
      min: total * 0.95,
      max: total * 1.05,
    };
  }

  const contextValue: AppContextType = {
    state,
    dispatch,
    addToMenu,
    removeFromMenu,
    updateServings,
    clearMenu,
    isInMenu,
    generateGroceryList,
    getMenuTotal,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

// Hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
