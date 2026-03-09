/**
 * PDA derivation utilities for SSS Token Program
 */

import { PublicKey } from "@solana/web3.js";
import { PDA_SEEDS, SSS_TOKEN_PROGRAM_ID } from "./constants";
import { PDAResult } from "./types";

/**
 * Find the Config PDA for a given mint
 * @param mint - The mint public key
 * @param programId - The program ID (defaults to SSS_TOKEN_PROGRAM_ID)
 * @returns The config PDA and bump
 */
export function findConfigPDA(
  mint: PublicKey,
  programId: PublicKey = new PublicKey(SSS_TOKEN_PROGRAM_ID)
): PDAResult {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.CONFIG), mint.toBuffer()],
    programId
  );
  return { pda, bump };
}

/**
 * Find the MinterInfo PDA for a given config and minter
 * @param config - The config PDA
 * @param minter - The minter public key
 * @param programId - The program ID (defaults to SSS_TOKEN_PROGRAM_ID)
 * @returns The minter info PDA and bump
 */
export function findMinterInfoPDA(
  config: PublicKey,
  minter: PublicKey,
  programId: PublicKey = new PublicKey(SSS_TOKEN_PROGRAM_ID)
): PDAResult {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MINTER), config.toBuffer(), minter.toBuffer()],
    programId
  );
  return { pda, bump };
}

/**
 * Find the BlacklistEntry PDA for a given config and user
 * @param config - The config PDA
 * @param user - The user public key
 * @param programId - The program ID (defaults to SSS_TOKEN_PROGRAM_ID)
 * @returns The blacklist entry PDA and bump
 */
export function findBlacklistEntryPDA(
  config: PublicKey,
  user: PublicKey,
  programId: PublicKey = new PublicKey(SSS_TOKEN_PROGRAM_ID)
): PDAResult {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.BLACKLIST), config.toBuffer(), user.toBuffer()],
    programId
  );
  return { pda, bump };
}

/**
 * Find all PDAs for a stablecoin configuration
 * @param mint - The mint public key
 * @param programId - The program ID (defaults to SSS_TOKEN_PROGRAM_ID)
 * @returns Object containing all derived PDAs
 */
export function findAllPDAs(
  mint: PublicKey,
  programId: PublicKey = new PublicKey(SSS_TOKEN_PROGRAM_ID)
) {
  const config = findConfigPDA(mint, programId);
  
  return {
    config,
    getMinterInfo: (minter: PublicKey) => findMinterInfoPDA(config.pda, minter, programId),
    getBlacklistEntry: (user: PublicKey) => findBlacklistEntryPDA(config.pda, user, programId),
  };
}