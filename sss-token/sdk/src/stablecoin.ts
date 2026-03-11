/**
 * Enhanced SolanaStablecoin SDK with namespaced API and preset support
 * 
 * This provides a more intuitive API for interacting with SSS Token stablecoins:
 * - Factory method: `SolanaStablecoin.create()` with preset support
 * - Namespaced compliance API: `stable.compliance.blacklistAdd()`
 * - Namespaced minting API: `stable.minting.addMinter()`
 */

import {
  PublicKey,
  Signer,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  LENGTH_SIZE,
  TYPE_SIZE,
} from "@solana/spl-token";
import { AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import { SSSTokenClient } from "./program";
import {
  Preset,
  PRESET_CONFIGS,
  PresetConfig,
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
  StablecoinConfig,
  MinterInfo,
  BlacklistEntry,
  SSSTokenSDKConfig,
} from "./types";
import { findConfigPDA, findMinterInfoPDA, findBlacklistEntryPDA } from "./pda";

/**
 * Options for creating a new stablecoin
 */
export interface CreateStablecoinOptions {
  /** Preset configuration (SSS_1 or SSS_2) */
  preset: Preset;
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Metadata URI */
  uri: string;
  /** Token decimals (default: 6) */
  decimals?: number;
  /** Override preset configuration */
  overrideConfig?: Partial<PresetConfig>;
}

/**
 * Options for connecting to an existing stablecoin
 */
export interface ConnectStablecoinOptions {
  /** The mint address of the stablecoin */
  mint: PublicKey;
}

/**
 * Compliance API namespace
 * Provides methods for blacklist, freeze, and seizure operations
 */
export class ComplianceAPI {
  constructor(
    private client: SSSTokenClient,
    private mint: PublicKey
  ) {}

  /**
   * Add an address to the blacklist
   * @param blacklister - The blacklister signer
   * @param user - The address to blacklist
   * @param reason - Reason for blacklisting
   */
  async blacklistAdd(
    blacklister: Signer,
    user: PublicKey,
    reason: string
  ): Promise<string> {
    return this.client.addToBlacklist(this.mint, blacklister, { user, reason });
  }

  /**
   * Remove an address from the blacklist
   * @param blacklister - The blacklister signer
   * @param user - The address to remove from blacklist
   */
  async blacklistRemove(
    blacklister: Signer,
    user: PublicKey
  ): Promise<string> {
    return this.client.removeFromBlacklist(this.mint, blacklister, { user });
  }

  /**
   * Check if an address is blacklisted
   * @param user - The address to check
   */
  async isBlacklisted(user: PublicKey): Promise<boolean> {
    return this.client.isBlacklisted(this.mint, user);
  }

  /**
   * Get blacklist entry for an address
   * @param user - The address to look up
   */
  async getBlacklistEntry(user: PublicKey): Promise<BlacklistEntry> {
    return this.client.getBlacklistEntry(this.mint, user);
  }

  /**
   * Freeze a token account
   * @param tokenAccount - The token account to freeze
   * @param freezeAuthority - The freeze authority signer
   */
  async freeze(
    tokenAccount: PublicKey,
    freezeAuthority: Signer
  ): Promise<string> {
    return this.client.freezeTokenAccount(this.mint, tokenAccount, freezeAuthority);
  }

  /**
   * Thaw (unfreeze) a token account
   * @param tokenAccount - The token account to thaw
   * @param freezeAuthority - The freeze authority signer
   */
  async thaw(
    tokenAccount: PublicKey,
    freezeAuthority: Signer
  ): Promise<string> {
    return this.client.thawTokenAccount(this.mint, tokenAccount, freezeAuthority);
  }

  /**
   * Seize tokens from a frozen account
   * @param seizer - The seizer signer
   * @param sourceToken - Source token account (frozen)
   * @param destToken - Destination token account
   * @param amount - Amount to seize
   */
  async seize(
    seizer: Signer,
    sourceToken: PublicKey,
    destToken: PublicKey,
    amount: BN | number
  ): Promise<string> {
    return this.client.seize(this.mint, seizer, {
      sourceToken,
      destToken,
      amount: typeof amount === "number" ? new BN(amount) : amount,
    });
  }
}

/**
 * Minting API namespace
 * Provides methods for minter management and token minting
 */
export class MintingAPI {
  constructor(
    private client: SSSTokenClient,
    private mintAddress: PublicKey
  ) {}

  /**
   * Add a new minter with quota
   * @param masterAuthority - The master authority signer
   * @param minter - The minter address
   * @param quota - Minting quota
   */
  async addMinter(
    masterAuthority: Signer,
    minter: PublicKey,
    quota: BN | number
  ): Promise<string> {
    return this.client.addMinter(this.mintAddress, masterAuthority, {
      minter,
      quota: typeof quota === "number" ? new BN(quota) : quota,
    });
  }

  /**
   * Update minter quota
   * @param masterAuthority - The master authority signer
   * @param minter - The minter address
   * @param newQuota - New minting quota
   */
  async updateQuota(
    masterAuthority: Signer,
    minter: PublicKey,
    newQuota: BN | number
  ): Promise<string> {
    return this.client.updateMinterQuota(this.mintAddress, masterAuthority, {
      minter,
      newQuota: typeof newQuota === "number" ? new BN(newQuota) : newQuota,
    });
  }

  /**
   * Remove a minter
   * @param masterAuthority - The master authority signer
   * @param minter - The minter address to remove
   */
  async removeMinter(
    masterAuthority: Signer,
    minter: PublicKey
  ): Promise<string> {
    return this.client.removeMinter(this.mintAddress, masterAuthority, { minter });
  }

  /**
   * Get minter info
   * @param minter - The minter address
   */
  async getMinterInfo(minter: PublicKey): Promise<MinterInfo> {
    return this.client.getMinterInfo(this.mintAddress, minter);
  }

  /**
   * Mint tokens to an account
   * @param mintAuthority - The mint authority signer
   * @param minter - The minter address (for quota tracking)
   * @param tokenAccount - Destination token account
   * @param amount - Amount to mint
   */
  async mintTokens(
    mintAuthority: Signer,
    minter: PublicKey,
    tokenAccount: PublicKey,
    amount: BN | number
  ): Promise<string> {
    return this.client.mintTokens(this.mintAddress, mintAuthority, minter, tokenAccount, {
      amount: typeof amount === "number" ? new BN(amount) : amount,
    });
  }
}

/**
 * Burning API namespace
 */
export class BurningAPI {
  constructor(
    private client: SSSTokenClient,
    private mint: PublicKey
  ) {}

  /**
   * Burn tokens from an account
   * @param tokenAccount - The token account to burn from
   * @param burner - The burner signer
   * @param amount - Amount to burn
   */
  async burn(
    tokenAccount: PublicKey,
    burner: Signer,
    amount: BN | number
  ): Promise<string> {
    return this.client.burnTokens(this.mint, tokenAccount, burner, {
      amount: typeof amount === "number" ? new BN(amount) : amount,
    });
  }
}

/**
 * Pause API namespace
 */
export class PauseAPI {
  constructor(
    private client: SSSTokenClient,
    private mint: PublicKey
  ) {}

  /**
   * Pause all token operations
   * @param pauser - The pauser signer
   */
  async pause(pauser: Signer): Promise<string> {
    return this.client.pause(this.mint, pauser);
  }

  /**
   * Unpause all token operations
   * @param pauser - The pauser signer
   */
  async unpause(pauser: Signer): Promise<string> {
    return this.client.unpause(this.mint, pauser);
  }

  /**
   * Check if the stablecoin is paused
   */
  async isPaused(): Promise<boolean> {
    const config = await this.client.getConfig(this.mint);
    return config.paused;
  }
}

/**
 * Authority API namespace
 */
export class AuthorityAPI {
  constructor(
    private client: SSSTokenClient,
    private mint: PublicKey
  ) {}

  /**
   * Transfer master authority to a new address
   * @param masterAuthority - Current master authority signer
   * @param newMasterAuthority - New master authority address
   */
  async transfer(
    masterAuthority: Signer,
    newMasterAuthority: PublicKey
  ): Promise<string> {
    return this.client.transferAuthority(this.mint, masterAuthority, {
      newMasterAuthority,
    });
  }

  /**
   * Update compliance roles (blacklister, pauser, seizer)
   * @param masterAuthority - The master authority signer
   * @param roles - New role addresses
   */
  async updateRoles(
    masterAuthority: Signer,
    roles: {
      blacklister?: PublicKey;
      pauser?: PublicKey;
      seizer?: PublicKey;
    }
  ): Promise<string> {
    const config = await this.client.getConfig(this.mint);
    return this.client.updateRoles(this.mint, masterAuthority, {
      newBlacklister: roles.blacklister ?? config.blacklister,
      newPauser: roles.pauser ?? config.pauser,
      newSeizer: roles.seizer ?? config.seizer,
    });
  }
}

/**
 * SolanaStablecoin - Main SDK class with namespaced API
 * 
 * @example
 * ```typescript
 * // Create a new SSS-2 compliant stablecoin
 * const stable = await SolanaStablecoin.create(provider, {
 *   preset: Preset.SSS_2,
 *   name: "My USD",
 *   symbol: "MYUSD",
 *   uri: "https://example.com/metadata.json",
 * });
 * 
 * // Connect to existing stablecoin
 * const stable = await SolanaStablecoin.connect(provider, { mint });
 * 
 * // Use namespaced APIs
 * await stable.compliance.blacklistAdd(blacklister, userAddr, "Sanctioned");
 * await stable.minting.addMinter(authority, minterAddr, 1_000_000);
 * await stable.pause.pause(pauser);
 * ```
 */
export class SolanaStablecoin {
  /** The underlying SSS Token client */
  readonly client: SSSTokenClient;
  
  /** The mint address */
  readonly mint: PublicKey;
  
  /** Compliance API (blacklist, freeze, seize) */
  readonly compliance: ComplianceAPI;
  
  /** Minting API (minter management, minting) */
  readonly minting: MintingAPI;
  
  /** Burning API */
  readonly burning: BurningAPI;
  
  /** Pause API */
  readonly pause: PauseAPI;
  
  /** Authority API (role management) */
  readonly authority: AuthorityAPI;

  private constructor(client: SSSTokenClient, mint: PublicKey) {
    this.client = client;
    this.mint = mint;
    
    // Initialize namespaced APIs
    this.compliance = new ComplianceAPI(client, mint);
    this.minting = new MintingAPI(client, mint);
    this.burning = new BurningAPI(client, mint);
    this.pause = new PauseAPI(client, mint);
    this.authority = new AuthorityAPI(client, mint);
  }

  /**
   * Create a new stablecoin with a preset configuration
   * 
   * @param provider - Anchor provider
   * @param options - Creation options including preset
   * @returns SolanaStablecoin instance
   * 
   * @example
   * ```typescript
   * const stable = await SolanaStablecoin.create(provider, {
   *   preset: Preset.SSS_2,
   *   name: "My Stablecoin",
   *   symbol: "MYST",
   *   uri: "https://example.com/metadata.json",
   *   decimals: 6,
   * });
   * ```
   */
  static async create(
    provider: AnchorProvider,
    options: CreateStablecoinOptions
  ): Promise<SolanaStablecoin> {
    const client = new SSSTokenClient({ provider });
    
    // Get preset configuration
    const presetConfig = PRESET_CONFIGS[options.preset];
    const config = {
      ...presetConfig,
      ...options.overrideConfig,
    };
    
    const decimals = options.decimals ?? 6;
    
    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    const authority = provider.wallet;
    
    // Build initialize params
    const initParams: InitializeParams = {
      name: options.name,
      symbol: options.symbol,
      uri: options.uri,
      decimals,
      enablePermanentDelegate: config.enablePermanentDelegate,
      enableTransferHook: config.enableTransferHook,
      defaultAccountFrozen: config.defaultAccountFrozen,
    };
    
    // Initialize the stablecoin
    await client.initialize(mintKeypair.publicKey, authority as any, initParams);
    
    return new SolanaStablecoin(client, mintKeypair.publicKey);
  }

  /**
   * Connect to an existing stablecoin
   * 
   * @param provider - Anchor provider
   * @param options - Connection options including mint address
   * @returns SolanaStablecoin instance
   * 
   * @example
   * ```typescript
   * const stable = await SolanaStablecoin.connect(provider, {
   *   mint: new PublicKey("..."),
   * });
   * ```
   */
  static async connect(
    provider: AnchorProvider,
    options: ConnectStablecoinOptions
  ): Promise<SolanaStablecoin> {
    const client = new SSSTokenClient({ provider });
    
    // Verify the stablecoin exists by fetching config
    await client.getConfig(options.mint);
    
    return new SolanaStablecoin(client, options.mint);
  }

  /**
   * Create from an existing SSSTokenClient
   * Useful when you already have a client instance
   */
  static fromClient(client: SSSTokenClient, mint: PublicKey): SolanaStablecoin {
    return new SolanaStablecoin(client, mint);
  }

  /**
   * Get the stablecoin configuration
   */
  async getConfig(): Promise<StablecoinConfig> {
    return this.client.getConfig(this.mint);
  }

  /**
   * Get the mint address as string
   */
  get mintAddress(): string {
    return this.mint.toString();
  }

  /**
   * Get associated token address for a wallet
   */
  async getAssociatedTokenAddress(owner: PublicKey): Promise<PublicKey> {
    return this.client.getAssociatedTokenAddress(this.mint, owner);
  }
}