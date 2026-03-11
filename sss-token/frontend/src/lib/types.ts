/**
 * SSS Token Frontend Types
 */

export interface StablecoinConfig {
  address: string;
  masterAuthority: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  bump: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  blacklister: string;
  pauser: string;
  seizer: string;
}

export interface StablecoinWithSupply extends StablecoinConfig {
  supply: bigint;
  holderCount?: number;
}

export interface FetchResult {
  stablecoins: StablecoinWithSupply[];
  error: string | null;
  loading: boolean;
}

export interface IndexerStablecoin {
  address: string;
  mint: string;
  name: string;
  symbol: string;
  supply: string;
  holderCount: number;
  paused: boolean;
  features: {
    permanentDelegate: boolean;
    transferHook: boolean;
    defaultAccountFrozen: boolean;
  };
}