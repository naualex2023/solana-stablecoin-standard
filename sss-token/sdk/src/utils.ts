/**
 * Utility functions for the SDK
 */

import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  burn,
  getAccount,
  freezeAccount,
  thawAccount,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { StablecoinConfig, MinterInfo, BlacklistEntry } from "./types";

/**
 * Create a new token mint with specified authority
 */
export async function createTokenMint(
  connection: any,
  payer: Keypair,
  authority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number
): Promise<PublicKey> {
  const mint = await createMint(
    connection,
    payer,
    authority,
    freezeAuthority,
    decimals
  );
  return mint;
}

/**
 * Create a token account
 */
export async function createTokenAccount(
  connection: any,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const tokenAccount = await createAccount(
    connection,
    payer,
    mint,
    owner
  );
  return tokenAccount;
}

/**
 * Get or create a token account for a given owner
 */
export async function getOrCreateTokenAccount(
  connection: any,
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<PublicKey> {
  try {
    const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
    const associatedTokenAddress = await getAssociatedTokenAddress(mint, owner);
    await getAccount(connection, associatedTokenAddress);
    return associatedTokenAddress;
  } catch {
    return await createTokenAccount(connection, payer, mint, owner);
  }
}

/**
 * Mint tokens to an account
 */
export async function mintTokensToAccount(
  connection: any,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  authority: Keypair,
  amount: BN
): Promise<void> {
  await mintTo(
    connection,
    payer,
    mint,
    destination,
    authority,
    amount.toNumber()
  );
}

/**
 * Burn tokens from an account
 */
export async function burnTokensFromAccount(
  connection: any,
  payer: Keypair,
  account: PublicKey,
  mint: PublicKey,
  owner: Keypair,
  amount: BN
): Promise<void> {
  await burn(
    connection,
    payer,
    account,
    mint,
    owner,
    amount.toNumber()
  );
}

/**
 * Freeze a token account
 */
export async function freezeTokenAccount(
  connection: any,
  payer: Keypair,
  account: PublicKey,
  mint: PublicKey,
  authority: Keypair
): Promise<void> {
  await freezeAccount(connection, payer, account, mint, authority);
}

/**
 * Thaw (unfreeze) a token account
 */
export async function thawTokenAccount(
  connection: any,
  payer: Keypair,
  account: PublicKey,
  mint: PublicKey,
  authority: Keypair
): Promise<void> {
  await thawAccount(connection, payer, account, mint, authority);
}

/**
 * Fetch stablecoin config from the program
 */
export async function fetchConfig(
  program: Program,
  mint: PublicKey
): Promise<StablecoinConfig> {
  const configPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    program.programId
  )[0];
  
  const account = await (program.account as any)["stablecoinConfig"].fetch(configPDA);
  return account as unknown as StablecoinConfig;
}

/**
 * Fetch minter info from the program
 */
export async function fetchMinterInfo(
  program: Program,
  mint: PublicKey,
  minter: PublicKey
): Promise<MinterInfo> {
  const configPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    program.programId
  )[0];
  
  const minterInfoPDA = PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), configPDA.toBuffer(), minter.toBuffer()],
    program.programId
  )[0];
  
  const account = await (program.account as any)["minterInfo"].fetch(minterInfoPDA);
  return account as unknown as MinterInfo;
}

/**
 * Fetch blacklist entry from the program
 */
export async function fetchBlacklistEntry(
  program: Program,
  mint: PublicKey,
  user: PublicKey
): Promise<BlacklistEntry | null> {
  try {
    const configPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    )[0];
    
    const blacklistEntryPDA = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), configPDA.toBuffer(), user.toBuffer()],
      program.programId
    )[0];
    
    const account = await (program.account as any)["blacklistEntry"].fetch(blacklistEntryPDA);
    return account as unknown as BlacklistEntry;
  } catch {
    return null;
  }
}

/**
 * Check if an account is frozen
 */
export async function isAccountFrozen(
  connection: any,
  account: PublicKey
): Promise<boolean> {
  try {
    const accountInfo = await getAccount(connection, account);
    return accountInfo.isFrozen;
  } catch {
    return false;
  }
}

/**
 * Get account balance
 */
export async function getAccountBalance(
  connection: any,
  account: PublicKey
): Promise<number> {
  const accountInfo = await getAccount(connection, account);
  return Number(accountInfo.amount);
}

/**
 * Create a sleep/delay function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert lamports to tokens based on decimals
 */
export function lamportsToTokens(lamports: number, decimals: number): number {
  return lamports / Math.pow(10, decimals);
}

/**
 * Convert tokens to lamports based on decimals
 */
export function tokensToLamports(tokens: number, decimals: number): number {
  return Math.floor(tokens * Math.pow(10, decimals));
}