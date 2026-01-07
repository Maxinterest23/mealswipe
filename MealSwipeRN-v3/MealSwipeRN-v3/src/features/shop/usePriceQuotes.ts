import { useEffect, useMemo, useRef, useState } from 'react';
import { getRecipeById } from '@/data/recipes';
import { stores } from '@/data/stores';
import { MenuItem } from '@/types';
import { postQuote, QuoteRequestItem, QuoteResponse, QuoteUnitType, isQuoteConfigured } from '@/src/api/quoteClient';

const DEBOUNCE_MS = 400;

function normalizeUnit(unit: string | null | undefined, value: number): { unit: QuoteUnitType; value: number } {
  if (typeof unit !== 'string') {
    return { unit: 'COUNT', value };
  }
  const normalized = unit.trim().toLowerCase();
  if (['g', 'gram', 'grams'].includes(normalized)) return { unit: 'GRAM', value };
  if (normalized === 'kg') return { unit: 'GRAM', value: value * 1000 };
  if (['ml'].includes(normalized)) return { unit: 'ML', value };
  if (normalized === 'l') return { unit: 'ML', value: value * 1000 };
  if (normalized === 'tsp') return { unit: 'ML', value: value * 5 };
  if (normalized === 'tbsp') return { unit: 'ML', value: value * 15 };
  if (['piece', 'pieces', 'clove', 'cloves'].includes(normalized)) return { unit: 'COUNT', value };
  return { unit: 'COUNT', value };
}

function buildQuoteItems(menuItems: MenuItem[]): QuoteRequestItem[] {
  const aggregated = new Map<string, QuoteRequestItem>();

  menuItems.forEach((menuItem) => {
    const recipe = getRecipeById(menuItem.recipeId);
    if (!recipe) return;

    const scale = menuItem.servings / recipe.servings;

    recipe.ingredients.forEach((ingredient) => {
      const rawName =
        typeof ingredient.canonicalName === 'string'
          ? ingredient.canonicalName
          : typeof ingredient.name === 'string'
            ? ingredient.name
            : '';
      const key = rawName.trim().toLowerCase();
      if (!key) return;

      const quantity = Number(ingredient.quantity);
      if (!Number.isFinite(quantity)) return;
      const normalized = normalizeUnit(ingredient.unit, quantity * scale);
      const existing = aggregated.get(key);

      if (existing) {
        existing.required.value += normalized.value;
      } else {
        aggregated.set(key, {
          ingredientName: ingredient.canonicalName,
          required: {
            value: normalized.value,
            unit: normalized.unit,
          },
        });
      }
    });
  });

  return Array.from(aggregated.values());
}

export function usePriceQuotes(menuItems: MenuItem[]) {
  const [quotes, setQuotes] = useState<QuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSuccessRef = useRef<QuoteResponse | null>(null);

  const payload = useMemo(() => {
    const items = buildQuoteItems(menuItems);
    return {
      stores: stores.map((store) => store.id),
      items,
    };
  }, [menuItems]);

  useEffect(() => {
    if (!menuItems.length) {
      setQuotes(null);
      setError(null);
      return;
    }

    if (!isQuoteConfigured()) {
      setError('Quote endpoint not configured.');
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await postQuote(payload);
        if (!isMounted) return;
        setQuotes(response);
        lastSuccessRef.current = response;
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Unable to fetch quotes.';
        setError(message);
        if (lastSuccessRef.current) {
          setQuotes(lastSuccessRef.current);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [menuItems.length, payload]);

  return {
    quotes,
    isLoading,
    error,
    isFallback: Boolean(error),
  };
}
