/**
 * SSS Token Frontend Constants
 */

// Program ID for the SSS Token program on devnet
export const PROGRAM_ID = 'Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw';

// Anchor discriminator for StablecoinConfig account
// From IDL: [127, 25, 244, 213, 1, 192, 101, 6]
export const CONFIG_DISCRIMINATOR = Buffer.from([
  127, 25, 244, 213, 1, 192, 101, 6
]);

// StablecoinConfig account size (from program)
export const CONFIG_ACCOUNT_SIZE = 8 + 32 + 32 + 4 + 100 + 4 + 10 + 4 + 200 + 1 + 1 + 1 + 1 + 1 + 1 + 32 + 32 + 32;

// Fetch modes
export type FetchMode = 'rpc' | 'indexer';

// Default RPC URL
export const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

// Get the current RPC URL from environment
export const getRpcUrl = (): string => {
  return process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL;
};

// Detect network from RPC URL
export const getCurrentNetwork = (): string => {
  const rpcUrl = getRpcUrl().toLowerCase();
  if (rpcUrl.includes('mainnet')) {
    return 'mainnet-beta';
  } else if (rpcUrl.includes('devnet')) {
    return 'devnet';
  } else if (rpcUrl.includes('testnet')) {
    return 'testnet';
  } else if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) {
    return 'localnet';
  }
  return 'custom';
};
