/**
 * Program constants for SSS Token Stablecoin
 */

/**
 * The SSS Token program ID
 */
export const SSS_TOKEN_PROGRAM_ID = "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw";

/**
 * Seed values for PDA derivation
 */
export const PDA_SEEDS = {
  CONFIG: "config",
  MINTER: "minter",
  BLACKLIST: "blacklist",
} as const;

/**
 * Token-2022 Program ID
 * The SSS Token program uses Token-2022 extensions
 */
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Error codes matching the Rust program
 */
export const SSS_TOKEN_ERROR_CODE = {
  Unauthorized: 6000,
  InvalidAccount: 6001,
  QuotaExceeded: 6002,
  AccountFrozen: 6003,
  TokenPaused: 6004,
  ComplianceNotEnabled: 6005,
  PermanentDelegateNotEnabled: 6006,
  AlreadyBlacklisted: 6007,
  NotBlacklisted: 6008,
  InvalidAmount: 6009,
} as const;

/**
 * Error messages matching the Rust program
 */
export const SSS_TOKEN_ERROR_MESSAGE: Record<number, string> = {
  [SSS_TOKEN_ERROR_CODE.Unauthorized]: "Unauthorized access",
  [SSS_TOKEN_ERROR_CODE.InvalidAccount]: "Invalid account",
  [SSS_TOKEN_ERROR_CODE.QuotaExceeded]: "Mint quota exceeded",
  [SSS_TOKEN_ERROR_CODE.AccountFrozen]: "Account is frozen",
  [SSS_TOKEN_ERROR_CODE.TokenPaused]: "Token is paused",
  [SSS_TOKEN_ERROR_CODE.ComplianceNotEnabled]: "Compliance module not enabled",
  [SSS_TOKEN_ERROR_CODE.PermanentDelegateNotEnabled]: "Permanent delegate not enabled",
  [SSS_TOKEN_ERROR_CODE.AlreadyBlacklisted]: "Already in blacklist",
  [SSS_TOKEN_ERROR_CODE.NotBlacklisted]: "Not in blacklist",
  [SSS_TOKEN_ERROR_CODE.InvalidAmount]: "Invalid amount",
};

/**
 * Maximum lengths for string fields
 */
export const MAX_LENGTHS = {
  NAME: 100,
  SYMBOL: 10,
  URI: 200,
  REASON: 100,
} as const;