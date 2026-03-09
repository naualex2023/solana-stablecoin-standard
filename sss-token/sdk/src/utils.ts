/**
 * Helper utilities for SSS Token SDK
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMint,
  createMintToInstruction,
  createBurnInstruction,
  createTransferCheckedInstruction,
  createFreezeAccountInstruction,
  createThawAccountInstruction,
  MintLayout,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import { SSS_TOKEN_PROGRAM_ID } from "./constants";
import { StablecoinConfig, MinterInfo, BlacklistEntry } from "./types";

/**
 * Create a new provider from a connection and wallet
 */
export function createProvider(
  connection: Connection,
  wallet: Wallet
): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
}

/**
 * Get or create a token account for a given mint and owner
 */
export async function getOrCreateTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  payer: Signer,
  allowOwnerOffCurve: boolean = false
): Promise<PublicKey> {
  const associatedTokenAddress = await getAssociatedTokenAddress(
    mint,
    owner,
    allowOwnerOffCurve
  );

  try {
    await connection.getAccountInfo(associatedTokenAddress);
    return associatedTokenAddress;
  } catch {
    // Account doesn't exist, create it
    const transaction = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAddress,
        owner,
        mint
      )
    );

    await connection.sendTransaction(transaction, [payer]);
    return associatedTokenAddress;
  }
}

/**
 * Create a new mint account
 */
export async function createTokenMint(
  connection: Connection,
  payer: Signer,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number
): Promise<PublicKey> {
  const mint = Keypair.generate();
  await createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
    mint
  );
  return mint.publicKey;
}

/**
 * Mint tokens to a token account
 */
export async function mintTo(
  connection: Connection,
  mint: PublicKey,
  destination: PublicKey,
  authority: Signer,
  amount: number | BN
): Promise<void> {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  const instruction = createMintToInstruction(
    mint,
    destination,
    authority.publicKey,
    amountBN.toNumber()
  );

  const transaction = new Transaction().add(instruction);
  await connection.sendTransaction(transaction, [authority]);
}

/**
 * Burn tokens from a token account
 */
export async function burn(
  connection: Connection,
  mint: PublicKey,
  source: PublicKey,
  owner: Signer,
  amount: number | BN
): Promise<void> {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  const instruction = createBurnInstruction(source, mint, owner.publicKey, amountBN.toNumber());

  const transaction = new Transaction().add(instruction);
  await connection.sendTransaction(transaction, [owner]);
}

/**
 * Transfer tokens between accounts
 */
export async function transfer(
  connection: Connection,
  from: PublicKey,
  to: PublicKey,
  owner: Signer,
  mint: PublicKey,
  amount: number | BN,
  decimals: number
): Promise<void> {
  const amountBN = typeof amount === "number" ? new BN(amount) : amount;
  const instruction = createTransferCheckedInstruction(
    from,
    mint,
    to,
    owner.publicKey,
    amountBN.toNumber(),
    decimals
  );

  const transaction = new Transaction().add(instruction);
  await connection.sendTransaction(transaction, [owner]);
}

/**
 * Freeze a token account
 */
export async function freezeAccount(
  connection: Connection,
  account: PublicKey,
  mint: PublicKey,
  authority: Signer
): Promise<void> {
  const instruction = createFreezeAccountInstruction(account, mint, authority.publicKey);

  const transaction = new Transaction().add(instruction);
  await connection.sendTransaction(transaction, [authority]);
}

/**
 * Thaw (unfreeze) a token account
 */
export async function thawAccount(
  connection: Connection,
  account: PublicKey,
  mint: PublicKey,
  authority: Signer
): Promise<void> {
  const instruction = createThawAccountInstruction(account, mint, authority.publicKey);

  const transaction = new Transaction().add(instruction);
  await connection.sendTransaction(transaction, [authority]);
}

/**
 * Get token balance for an account
 */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
  return Number(accountInfo.value.amount);
}

/**
 * Fetch stablecoin config account data
 */
export async function fetchConfig(
  program: Program,
  configPda: PublicKey
): Promise<StablecoinConfig> {
  const account = await program.account.stablecoinConfig.fetch(configPda);
  return account as unknown as StablecoinConfig;
}

/**
 * Fetch minter info account data
 */
export async function fetchMinterInfo(
  program: Program,
  minterInfoPda: PublicKey
): Promise<MinterInfo> {
  const account = await program.account.minterInfo.fetch(minterInfoPda);
  return account as unknown as MinterInfo;
}

/**
 * Fetch blacklist entry account data
 */
export async function fetchBlacklistEntry(
  program: Program,
  blacklistEntryPda: PublicKey
): Promise<BlacklistEntry> {
  const account = await program.account.blacklistEntry.fetch(blacklistEntryPda);
  return account as unknown as BlacklistEntry;
}

/**
 * Check if an account exists
 */
export async function accountExists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  const accountInfo = await connection.getAccountInfo(account);
  return accountInfo !== null;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  connection: Connection,
  signature: string
): Promise<void> {
  await connection.confirmTransaction(signature, "confirmed");
}

/**
 * Get the current slot
 */
export async function getCurrentSlot(connection: Connection): Promise<number> {
  return await connection.getSlot();
}

/**
 * Get the current block time
 */
export async function getCurrentBlockTime(connection: Connection): Promise<number> {
  const slot = await getCurrentSlot(connection);
  const blockTime = await connection.getBlockTime(slot);
  return blockTime || 0;
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports: number | BN): number {
  const lamportsBN = typeof lamports === "number" ? new BN(lamports) : lamports;
  return lamportsBN.toNumber() / 1_000_000_000;
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): BN {
  return new BN(sol * 1_000_000_000);
}