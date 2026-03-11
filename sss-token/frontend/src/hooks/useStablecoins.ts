/**
 * React hook for fetching stablecoins
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchStablecoins, getFetchMode } from '@/lib/fetch-stablecoins';
import { StablecoinWithSupply, FetchResult } from '@/lib/types';

export interface UseStablecoinsResult extends FetchResult {
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all stablecoins
 */
export function useStablecoins(): UseStablecoinsResult {
  const [result, setResult] = useState<FetchResult>({
    stablecoins: [],
    error: null,
    loading: true,
  });

  const fetchData = useCallback(async () => {
    setResult(prev => ({ ...prev, loading: true, error: null }));
    
    const fetchResult = await fetchStablecoins();
    setResult(fetchResult);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...result,
    refetch: fetchData,
  };
}

/**
 * Hook to manage selected stablecoin (stored in localStorage)
 */
export function useSelectedStablecoin() {
  const [selected, setSelected] = useState<StablecoinWithSupply | null>(null);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('selectedStablecoinMint');
    if (stored) {
      setSelectedMint(stored);
    }
  }, []);

  // Update localStorage when selection changes
  const selectStablecoin = useCallback((coin: StablecoinWithSupply | null) => {
    setSelected(coin);
    if (coin) {
      localStorage.setItem('selectedStablecoinMint', coin.mint);
    } else {
      localStorage.removeItem('selectedStablecoinMint');
    }
  }, []);

  return {
    selected,
    selectedMint,
    selectStablecoin,
  };
}