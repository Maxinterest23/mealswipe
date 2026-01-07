import { Recipe } from '@/types';
import { getCachedRecipeById } from '@/src/data/recipeCache';
import { mockRecipes as mockRecipesData } from './mockRecipes';

export const mockRecipes: Recipe[] = mockRecipesData as Recipe[];

// Helper function to get recipe by ID
export function getRecipeById(id: string): Recipe | undefined {
  return getCachedRecipeById(id) ?? mockRecipes.find(r => r.id === id);
}

// Helper function to filter recipes
export function filterRecipes(
  recipes: Recipe[],
  filters: { costTiers: number[]; dietary: string[] }
): Recipe[] {
  return recipes.filter(recipe => {
    // Check cost tier
    if (!filters.costTiers.includes(recipe.costTier)) {
      return false;
    }
    
    // Check dietary badges (all must match)
    for (const badge of filters.dietary) {
      if (!recipe.badges.includes(badge)) {
        return false;
      }
    }
    
    return true;
  });
}
