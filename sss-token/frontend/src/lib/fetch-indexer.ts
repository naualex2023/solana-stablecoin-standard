/**
 * Fetch stablecoins from the backend indexer API
 * This is a placeholder for when the backend is deployed
 */

import { StablecoinWithSupply, IndexerStablecoin } from './types';

/**
 * Transform indexer response to our internal type
 * Note: supply is fetched separately from RPC, defaults to 0 here
 */
function transformIndexerResponse(data: IndexerStablecoin): StablecoinWithSupply {
  return {
    address: data.address,
    masterAuthority: '', // Not provided by indexer summary
    mint: data.mint,
    name: data.name,
    symbol: data.symbol,
    uri: '',
    decimals: 6, // Default, should be fetched from chain if needed
    paused: data.paused,
    bump: 0, // Not needed for display
    enablePermanentDelegate: data.features.permanentDelegate,
    enableTransferHook: data.features.transferHook,
    defaultAccountFrozen: data.features.defaultAccountFrozen,
    blacklister: '',
    pauser: '',
    seizer: '',
    supply: data.supply != null ? BigInt(data.supply) : BigInt(0),
    holderCount: data.holderCount,
  };
}

/**
 * Fetch all stablecoins from the indexer API
 */
export async function fetchStablecoinsFromIndexer(
  indexerUrl: string
): Promise<StablecoinWithSupply[]> {
  try {
    const response = await fetch(`${indexerUrl}/api/stablecoins`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Indexer returned ${response.status}`);
    }

    const data: IndexerStablecoin[] = await response.json();
    return data.map(transformIndexerResponse);
  } catch (error) {
    console.error('Failed to fetch from indexer:', error);
    throw error;
  }
}

/**
 * Fetch a single stablecoin from the indexer
 */
export async function fetchStablecoinFromIndexer(
  indexerUrl: string,
  mintAddress: string
): Promise<StablecoinWithSupply | null> {
  try {
    const response = await fetch(`${indexerUrl}/api/stablecoins/${mintAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Indexer returned ${response.status}`);
    }

    const data: IndexerStablecoin = await response.json();
    return transformIndexerResponse(data);
  } catch (error) {
    console.error('Failed to fetch stablecoin from indexer:', error);
    throw error;
  }
}