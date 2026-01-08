import { Recipe } from '@/types';
import { getCachedRecipeById } from '@/src/data/recipeCache';
import { curatedRecipes } from './curatedRecipes';
import { mockRecipes as mockRecipesData } from './mockRecipes';
const sampleData = require('./sample_recipes.json') as { recipes?: Recipe[] };

const sampleRecipes = sampleData?.recipes ?? [];

export const mockRecipes: Recipe[] = sampleRecipes.length
  ? sampleRecipes
  : [...curatedRecipes, ...(mockRecipesData as Recipe[])];

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
