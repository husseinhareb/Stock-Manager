// Custom hooks for database operations
import {
    fetchArticles,
    fetchClients,
    fetchPrices,
    fetchSavedClients,
    fetchSecondaryStock,
    fetchTotalQuantity,
    initDB,
} from '@/src/services/database';
import type {
    Article,
    ClientPin,
    Price,
    SavedClientSummary,
} from '@/src/types/database';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to fetch and manage China stock (main articles)
 */
export function useChinaStock() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [list, qty] = await Promise.all([
        fetchArticles(),
        fetchTotalQuantity(),
      ]);
      setArticles(list);
      setTotal(qty);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { articles, total, isLoading, error, reload: loadData };
}

/**
 * Hook to fetch and manage Brazil stock (secondary articles)
 */
export function useBrazilStock() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const stock = await fetchSecondaryStock();
      setArticles(stock);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { articles, isLoading, error, reload: loadData };
}

/**
 * Hook to fetch and manage prices
 */
export function usePrices() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [priceMap, setPriceMap] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await fetchPrices();
      setPrices(list);
      
      const map: Record<number, number> = {};
      list.forEach((p) => {
        map[p.article_id] = p.price;
      });
      setPriceMap(map);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { prices, priceMap, isLoading, error, reload: loadData };
}

/**
 * Hook to fetch and manage client pins on map
 */
export function useClientPins() {
  const [clients, setClients] = useState<ClientPin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await fetchClients();
      setClients(list);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { clients, isLoading, error, reload: loadData };
}

/**
 * Hook to fetch and manage saved clients
 */
export function useSavedClients() {
  const [savedClients, setSavedClients] = useState<SavedClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await fetchSavedClients();
      setSavedClients(list);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { savedClients, isLoading, error, reload: loadData };
}

/**
 * Hook to ensure database is initialized
 */
export function useInitializeDatabase() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    initDB()
      .then(() => setIsInitialized(true))
      .catch((e) => setError(e as Error));
  }, []);

  return { isInitialized, error };
}
