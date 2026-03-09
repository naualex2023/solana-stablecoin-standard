/**
 * Main SDK client for SSS Token Program
 */

import {
  PublicKey,
  Signer,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import idl from "./idl.json";
import { SSS_TOKEN_PROGRAM_ID } from "./constants";
import {
  SSSTokenSDKConfig,
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
} from "./types";
import { findConfigPDA, findMinterInfoPDA, findBlacklistEntryPDA } from "./pda";

/**
 * SSS Token SDK Client
 */
export class SSSTokenClient {
  readonly provider: AnchorProvider;
  readonly programId: PublicKey;
  readonly program: Program;
  readonly connection: any;
  readonly wallet: any;

  constructor(config: SSSTokenSDKConfig) {
    this.provider = config.provider;
    this.programId = config.programId || new PublicKey(SSS_TOKEN_PROGRAM_ID);
    this.connection = this.provider.connection;
    this.wallet = this.provider.wallet as any;
    // Use IDL with type assertion - common pattern in Anchor SDKs
    // The IDL structure doesn't perfectly match Anchor's TypeScript types
    // but is functionally correct at runtime
    this.program = new Program(
      idl as any,
      this.provider
    ) as any;
  }

  /**
   * Initialize a new stablecoin
   */
  async initialize(
    mint: PublicKey,
    authority: Signer,
    params: InitializeParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .initialize(
        params.name,
        params.symbol,
        params.uri,
        params.decimals,
        params.enablePermanentDelegate,
        params.enableTransferHook,
        params.defaultAccountFrozen
      )
      .accounts({
        config: configPda,
        mint: mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    return tx;
  }

  /**
   * Mint tokens to a recipient account
   */
  async mintTokens(
    mint: PublicKey,
    mintAuthority: Signer,
    minter: PublicKey,
    tokenAccount: PublicKey,
    params: MintTokensParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: minterInfoPda } = findMinterInfoPDA(configPda, minter, this.programId);

    const tx = await this.program.methods
      .mintTokens(params.amount)
      .accounts({
        config: configPda,
        mint: mint,
        mintAuthority: mintAuthority.publicKey,
        minter: minter,
        minterInfo: minterInfoPda,
        tokenAccount: tokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([mintAuthority])
      .rpc();

    return tx;
  }

  /**
   * Burn tokens from an account
   */
  async burnTokens(
    mint: PublicKey,
    tokenAccount: PublicKey,
    burner: Signer,
    params: BurnTokensParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .burnTokens(params.amount)
      .accounts({
        config: configPda,
        mint: mint,
        tokenAccount: tokenAccount,
        burner: burner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([burner])
      .rpc();

    return tx;
  }

  /**
   * Freeze a token account
   */
  async freezeTokenAccount(
    mint: PublicKey,
    tokenAccount: PublicKey,
    freezeAuthority: Signer
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .freezeTokenAccount()
      .accounts({
        config: configPda,
        mint: mint,
        tokenAccount: tokenAccount,
        freezeAuthority: freezeAuthority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([freezeAuthority])
      .rpc();

    return tx;
  }

  /**
   * Thaw (unfreeze) a token account
   */
  async thawTokenAccount(
    mint: PublicKey,
    tokenAccount: PublicKey,
    freezeAuthority: Signer
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .thawTokenAccount()
      .accounts({
        config: configPda,
        mint: mint,
        tokenAccount: tokenAccount,
        freezeAuthority: freezeAuthority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([freezeAuthority])
      .rpc();

    return tx;
  }

  /**
   * Pause all token operations
   */
  async pause(mint: PublicKey, pauser: Signer): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .pause()
      .accounts({
        config: configPda,
        mint: mint,
        pauser: pauser.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([pauser])
      .rpc();

    return tx;
  }

  /**
   * Unpause all token operations
   */
  async unpause(mint: PublicKey, pauser: Signer): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .unpause()
      .accounts({
        config: configPda,
        mint: mint,
        pauser: pauser.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([pauser])
      .rpc();

    return tx;
  }

  /**
   * Add a minter with specified quota
   */
  async addMinter(
    mint: PublicKey,
    masterAuthority: Signer,
    params: AddMinterParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: minterInfoPda } = findMinterInfoPDA(configPda, params.minter, this.programId);

    const tx = await this.program.methods
      .addMinter(params.quota)
      .accounts({
        config: configPda,
        mint: mint,
        minter: params.minter,
        minterInfo: minterInfoPda,
        masterAuthority: masterAuthority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([masterAuthority])
      .rpc();

    return tx;
  }

  /**
   * Update minter quota
   */
  async updateMinterQuota(
    mint: PublicKey,
    masterAuthority: Signer,
    params: UpdateMinterQuotaParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: minterInfoPda } = findMinterInfoPDA(configPda, params.minter, this.programId);

    const tx = await this.program.methods
      .updateMinterQuota(params.newQuota)
      .accounts({
        config: configPda,
        mint: mint,
        minter: params.minter,
        minterInfo: minterInfoPda,
        masterAuthority: masterAuthority.publicKey,
      })
      .signers([masterAuthority])
      .rpc();

    return tx;
  }

  /**
   * Remove a minter
   */
  async removeMinter(
    mint: PublicKey,
    masterAuthority: Signer,
    params: RemoveMinterParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: minterInfoPda } = findMinterInfoPDA(configPda, params.minter, this.programId);

    const tx = await this.program.methods
      .removeMinter()
      .accounts({
        config: configPda,
        mint: mint,
        minter: params.minter,
        minterInfo: minterInfoPda,
        masterAuthority: masterAuthority.publicKey,
      })
      .signers([masterAuthority])
      .rpc();

    return tx;
  }

  /**
   * Update roles (blacklister, pauser, seizer)
   */
  async updateRoles(
    mint: PublicKey,
    masterAuthority: Signer,
    params: UpdateRolesParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .updateRoles(
        params.newBlacklister,
        params.newPauser,
        params.newSeizer
      )
      .accounts({
        config: configPda,
        mint: mint,
        masterAuthority: masterAuthority.publicKey,
      })
      .signers([masterAuthority])
      .rpc();

    return tx;
  }

  /**
   * Add an address to the blacklist
   */
  async addToBlacklist(
    mint: PublicKey,
    blacklister: Signer,
    params: AddToBlacklistParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: blacklistEntryPda } = findBlacklistEntryPDA(
      configPda,
      params.user,
      this.programId
    );

    const tx = await this.program.methods
      .addToBlacklist(params.reason)
      .accounts({
        config: configPda,
        mint: mint,
        blacklister: blacklister.publicKey,
        user: params.user,
        blacklistEntry: blacklistEntryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([blacklister])
      .rpc();

    return tx;
  }

  /**
   * Remove an address from the blacklist
   */
  async removeFromBlacklist(
    mint: PublicKey,
    blacklister: Signer,
    params: RemoveFromBlacklistParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: blacklistEntryPda } = findBlacklistEntryPDA(
      configPda,
      params.user,
      this.programId
    );

    const tx = await this.program.methods
      .removeFromBlacklist()
      .accounts({
        config: configPda,
        mint: mint,
        blacklister: blacklister.publicKey,
        user: params.user,
        blacklistEntry: blacklistEntryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([blacklister])
      .rpc();

    return tx;
  }

  /**
   * Seize tokens from a frozen account
   */
  async seize(
    mint: PublicKey,
    seizer: Signer,
    params: SeizeParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .seize(params.amount)
      .accounts({
        config: configPda,
        mint: mint,
        sourceToken: params.sourceToken,
        destToken: params.destToken,
        seizer: seizer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seizer])
      .rpc();

    return tx;
  }

  /**
   * Transfer master authority
   */
  async transferAuthority(
    mint: PublicKey,
    masterAuthority: Signer,
    params: TransferAuthorityParams
  ): Promise<string> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);

    const tx = await this.program.methods
      .transferAuthority(params.newMasterAuthority)
      .accounts({
        config: configPda,
        mint: mint,
        masterAuthority: masterAuthority.publicKey,
      })
      .signers([masterAuthority])
      .rpc();

    return tx;
  }

  /**
   * Fetch the stablecoin config
   */
  async getConfig(mint: PublicKey): Promise<StablecoinConfig> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const account = await (this.program.account as any)["stablecoinConfig"].fetch(configPda);
    return account as unknown as StablecoinConfig;
  }

  /**
   * Fetch minter info
   */
  async getMinterInfo(mint: PublicKey, minter: PublicKey): Promise<MinterInfo> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: minterInfoPda } = findMinterInfoPDA(configPda, minter, this.programId);
    const account = await (this.program.account as any)["minterInfo"].fetch(minterInfoPda);
    return account as unknown as MinterInfo;
  }

  /**
   * Fetch blacklist entry
   */
  async getBlacklistEntry(mint: PublicKey, user: PublicKey): Promise<BlacklistEntry> {
    const { pda: configPda } = findConfigPDA(mint, this.programId);
    const { pda: blacklistEntryPda } = findBlacklistEntryPDA(configPda, user, this.programId);
    const account = await (this.program.account as any)["blacklistEntry"].fetch(blacklistEntryPda);
    return account as unknown as BlacklistEntry;
  }

  /**
   * Check if a user is blacklisted
   */
  async isBlacklisted(mint: PublicKey, user: PublicKey): Promise<boolean> {
    try {
      await this.getBlacklistEntry(mint, user);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the associated token account for a wallet
   */
  async getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return await getAssociatedTokenAddress(mint, owner);
  }
}