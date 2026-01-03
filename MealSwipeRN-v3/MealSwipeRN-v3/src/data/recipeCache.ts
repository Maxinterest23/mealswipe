import { Recipe } from '@/types';

const recipeCache = new Map<string, Recipe>();

export function cacheRecipes(recipes: Recipe[]) {
  for (const recipe of recipes) {
    recipeCache.set(recipe.id, recipe);
  }
}

export function getCachedRecipeById(id: string): Recipe | undefined {
  return recipeCache.get(id);
}
