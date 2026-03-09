/**
 * SSS Token SDK - TypeScript SDK for SSS Token Stablecoin Program
 * 
 * This SDK provides a comprehensive interface for interacting with the SSS Token
 * stablecoin program on Solana, supporting both SSS-1 (minimal) and SSS-2 (compliant) features.
 * 
 * @example
 * ```typescript
 * import { SSSTokenClient, AnchorProvider } from '@sss-token/sdk';
 * 
 * const provider = AnchorProvider.env();
 * const sdk = new SSSTokenClient({ provider });
 * 
 * // Initialize stablecoin
 * await sdk.initialize(mint, authority, {
 *   name: "My Stablecoin",
 *   symbol: "MYST",
 *   uri: "https://...",
 *   decimals: 6,
 *   enablePermanentDelegate: true,
 *   enableTransferHook: true,
 *   defaultAccountFrozen: false
 * });
 * ```
 */

// Main SDK client
export { SSSTokenClient } from "./program";

// PDA utilities
export {
  findConfigPDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
  findAllPDAs,
} from "./pda";

// Helper utilities
export {
  createTokenMint,
  createTokenAccount,
  getOrCreateTokenAccount,
  mintTokensToAccount,
  burnTokensFromAccount,
  freezeTokenAccount,
  thawTokenAccount,
  fetchConfig,
  fetchMinterInfo,
  fetchBlacklistEntry,
  isAccountFrozen,
  getAccountBalance,
  sleep,
  lamportsToTokens,
  tokensToLamports,
} from "./utils";

// Type definitions
export type {
  StablecoinConfig,
  MinterInfo,
  BlacklistEntry,
  InitializeParams,
  MintTokensParams,
  BurnTokensParams,
  AddMinterParams,
  UpdateMinterQuotaParams,
  RemoveMinterParams,
  UpdateRolesParams,
  AddToBlacklistParams,
  RemoveFromBlacklistParams,
  SeizeParams,
  TransferAuthorityParams,
  SSSTokenSDKConfig,
  PDAResult,
  SSSTokenInstruction,
} from "./types";

// Constants
export {
  SSS_TOKEN_PROGRAM_ID,
  PDA_SEEDS,
  SSS_TOKEN_ERROR_CODE,
  SSS_TOKEN_ERROR_MESSAGE,
  MAX_LENGTHS,
} from "./constants";

// Re-export commonly used types from dependencies for convenience
export type { PublicKey, Signer } from "@solana/web3.js";
export { AnchorProvider } from "@coral-xyz/anchor";
export type { Wallet } from "@coral-xyz/anchor";
export { TOKEN_PROGRAM_ID } from "@solana/spl-token";
