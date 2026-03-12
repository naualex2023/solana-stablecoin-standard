/**
 * Unified stablecoin fetching with dual-mode support
 * Can fetch from RPC directly or from indexer backend
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { FetchMode, DEFAULT_RPC_URL } from './constants';
import { StablecoinWithSupply, FetchResult } from './types';
import { fetchStablecoinsFromRPC, fetchStablecoinByMint } from './fetch-rpc';
import { fetchStablecoinsFromIndexer, fetchStablecoinFromIndexer } from './fetch-indexer';

/**
 * Configuration for fetching stablecoins
 */
export interface FetchConfig {
  mode: FetchMode;
  rpcUrl?: string;
  indexerUrl?: string;
}

/**
 * Get the current fetch mode from environment
 */
export function getFetchMode(): FetchMode {
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_FETCH_MODE as FetchMode) || 'rpc';
  }
  return 'rpc';
}

/**
 * Get the indexer URL from environment
 */
export function getIndexerUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_INDEXER_URL;
}

/**
 * Get the RPC URL from environment
 */
export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL;
}

/**
 * Create a Solana connection
 */
export function createConnection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl || getRpcUrl(), 'confirmed');
}

/**
 * Fetch all stablecoins using the configured mode
 */
export async function fetchStablecoins(config?: Partial<FetchConfig>): Promise<FetchResult> {
  const mode = config?.mode || getFetchMode();
  const indexerUrl = config?.indexerUrl || getIndexerUrl();
  const connection = createConnection(config?.rpcUrl);

  try {
    let stablecoins: StablecoinWithSupply[];

    if (mode === 'indexer' && indexerUrl) {
      // Use indexer backend for metadata
      stablecoins = await fetchStablecoinsFromIndexer(indexerUrl);
      
      // Fetch supply from RPC for each stablecoin (indexer doesn't track live supply)
      stablecoins = await Promise.all(
        stablecoins.map(async (coin) => {
          try {
            const mintPubkey = new PublicKey(coin.mint);
            const mintInfo = await connection.getTokenSupply(mintPubkey);
            return { ...coin, supply: BigInt(mintInfo.value.amount) };
          } catch (error) {
            console.warn(`Failed to fetch supply for ${coin.mint}:`, error);
            return coin; // Keep default supply (0)
          }
        })
      );
    } else {
      // Use direct RPC
      stablecoins = await fetchStablecoinsFromRPC(connection);
    }

    return {
      stablecoins,
      error: null,
      loading: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch stablecoins';
    console.error('Fetch error:', errorMessage);
    
    return {
      stablecoins: [],
      error: errorMessage,
      loading: false,
    };
  }
}

/**
 * Fetch a single stablecoin by mint address
 */
export async function fetchStablecoin(
  mintAddress: string,
  config?: Partial<FetchConfig>
): Promise<StablecoinWithSupply | null> {
  const mode = config?.mode || getFetchMode();
  const indexerUrl = config?.indexerUrl || getIndexerUrl();

  try {
    if (mode === 'indexer' && indexerUrl) {
      return await fetchStablecoinFromIndexer(indexerUrl, mintAddress);
    } else {
      const connection = createConnection(config?.rpcUrl);
      return await fetchStablecoinByMint(connection, mintAddress);
    }
  } catch (error) {
    console.error('Failed to fetch stablecoin:', error);
    return null;
  }
}

/**
 * Format supply for display
 */
export function formatSupply(supply: bigint, decimals: number = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = supply / divisor;
  const fraction = supply % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toLocaleString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}