/**
 * TypeScript type definitions for SSS Token Program
 */

import { PublicKey, Signer, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { Program, Provider, AnchorProvider } from "@coral-xyz/anchor";

/**
 * Preset configurations for stablecoin standards
 * 
 * SSS_1: Minimal stablecoin (basic mint/burn, no compliance features)
 * SSS_2: Compliant stablecoin (full compliance: blacklist, freeze, seize, pause)
 */
export enum Preset {
  /**
   * SSS-1: Minimal stablecoin standard
   * - Basic mint/burn functionality
   * - No permanent delegate
   * - No transfer hook
   * - Accounts not frozen by default
   */
  SSS_1 = "sss-1",
  
  /**
   * SSS-2: Compliant stablecoin standard
   * - Full compliance features
   * - Permanent delegate enabled (for seizure)
   * - Transfer hook enabled (for blacklist enforcement)
   * - Accounts frozen by default (KYC required)
   */
  SSS_2 = "sss-2",
}

/**
 * Preset configuration options
 */
export interface PresetConfig {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

/**
 * Map of preset configurations
 */
export const PRESET_CONFIGS: Record<Preset, PresetConfig> = {
  [Preset.SSS_1]: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  },
  [Preset.SSS_2]: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  },
};

/**
 * StablecoinConfig account data
 */
export interface StablecoinConfig {
  masterAuthority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  paused: boolean;
  bump: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  blacklister: PublicKey;
  pauser: PublicKey;
  seizer: PublicKey;
}

/**
 * MinterInfo account data
 */
export interface MinterInfo {
  authority: PublicKey;
  quota: BN;
  minted: BN;
  bump: number;
}

/**
 * BlacklistEntry account data
 */
export interface BlacklistEntry {
  user: PublicKey;
  reason: string;
  timestamp: BN;
  bump: number;
}

/**
 * Initialize instruction parameters
 */
export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

/**
 * MintTokens instruction parameters
 */
export interface MintTokensParams {
  amount: BN;
}

/**
 * BurnTokens instruction parameters
 */
export interface BurnTokensParams {
  amount: BN;
}

/**
 * AddMinter instruction parameters
 */
export interface AddMinterParams {
  minter: PublicKey;
  quota: BN;
}

/**
 * UpdateMinterQuota instruction parameters
 */
export interface UpdateMinterQuotaParams {
  minter: PublicKey;
  newQuota: BN;
}

/**
 * RemoveMinter instruction parameters
 */
export interface RemoveMinterParams {
  minter: PublicKey;
}

/**
 * UpdateRoles instruction parameters
 */
export interface UpdateRolesParams {
  newBlacklister: PublicKey;
  newPauser: PublicKey;
  newSeizer: PublicKey;
}

/**
 * AddToBlacklist instruction parameters
 */
export interface AddToBlacklistParams {
  user: PublicKey;
  reason: string;
}

/**
 * RemoveFromBlacklist instruction parameters
 */
export interface RemoveFromBlacklistParams {
  user: PublicKey;
}

/**
 * Seize instruction parameters
 */
export interface SeizeParams {
  sourceToken: PublicKey;
  destToken: PublicKey;
  amount: BN;
}

/**
 * TransferAuthority instruction parameters
 */
export interface TransferAuthorityParams {
  newMasterAuthority: PublicKey;
}

/**
 * SDK configuration
 */
export interface SSSTokenSDKConfig {
  provider: AnchorProvider;
  programId?: PublicKey;
}

/**
 * PDA derivation result
 */
export interface PDAResult {
  pda: PublicKey;
  bump: number;
}

/**
 * Context for initialize instruction
 */
export interface InitializeAccounts {
  config: PublicKey;
  mint: PublicKey;
  authority: Signer;
}

/**
 * Context for mintTokens instruction
 */
export interface MintTokensAccounts {
  config: PublicKey;
  mint: PublicKey;
  mintAuthority: Signer;
  minter: PublicKey;
  minterInfo: PublicKey;
  tokenAccount: PublicKey;
}

/**
 * Context for burnTokens instruction
 */
export interface BurnTokensAccounts {
  config: PublicKey;
  mint: PublicKey;
  tokenAccount: PublicKey;
  burner: Signer;
}

/**
 * Context for freezeTokenAccount instruction
 */
export interface FreezeTokenAccountAccounts {
  config: PublicKey;
  mint: PublicKey;
  tokenAccount: PublicKey;
  freezeAuthority: Signer;
}

/**
 * Context for thawTokenAccount instruction
 */
export interface ThawTokenAccountAccounts {
  config: PublicKey;
  mint: PublicKey;
  tokenAccount: PublicKey;
  freezeAuthority: Signer;
}

/**
 * Context for pause instruction
 */
export interface PauseAccounts {
  config: PublicKey;
  mint: PublicKey;
  pauser: Signer;
}

/**
 * Context for unpause instruction
 */
export interface UnpauseAccounts {
  config: PublicKey;
  mint: PublicKey;
  pauser: Signer;
}

/**
 * Context for addMinter instruction
 */
export interface AddMinterAccounts {
  config: PublicKey;
  mint: PublicKey;
  minter: PublicKey;
  minterInfo: PublicKey;
  masterAuthority: Signer;
}

/**
 * Context for updateMinterQuota instruction
 */
export interface UpdateMinterQuotaAccounts {
  config: PublicKey;
  mint: PublicKey;
  minter: PublicKey;
  minterInfo: PublicKey;
  masterAuthority: Signer;
}

/**
 * Context for removeMinter instruction
 */
export interface RemoveMinterAccounts {
  config: PublicKey;
  mint: PublicKey;
  minter: PublicKey;
  minterInfo: PublicKey;
  masterAuthority: Signer;
}

/**
 * Context for updateRoles instruction
 */
export interface UpdateRolesAccounts {
  config: PublicKey;
  mint: PublicKey;
  masterAuthority: Signer;
}

/**
 * Context for addToBlacklist instruction
 */
export interface AddToBlacklistAccounts {
  config: PublicKey;
  mint: PublicKey;
  blacklister: Signer;
  user: PublicKey;
  blacklistEntry: PublicKey;
}

/**
 * Context for removeFromBlacklist instruction
 */
export interface RemoveFromBlacklistAccounts {
  config: PublicKey;
  mint: PublicKey;
  blacklister: Signer;
  user: PublicKey;
  blacklistEntry: PublicKey;
}

/**
 * Context for seize instruction
 */
export interface SeizeAccounts {
  config: PublicKey;
  mint: PublicKey;
  sourceToken: PublicKey;
  destToken: PublicKey;
  seizer: Signer;
}

/**
 * Context for transferAuthority instruction
 */
export interface TransferAuthorityAccounts {
  config: PublicKey;
  mint: PublicKey;
  masterAuthority: Signer;
}

/**
 * Instruction types
 */
export type SSSTokenInstruction =
  | "initialize"
  | "mintTokens"
  | "burnTokens"
  | "freezeTokenAccount"
  | "thawTokenAccount"
  | "pause"
  | "unpause"
  | "addMinter"
  | "updateMinterQuota"
  | "removeMinter"
  | "updateRoles"
  | "addToBlacklist"
  | "removeFromBlacklist"
  | "seize"
  | "transferAuthority";