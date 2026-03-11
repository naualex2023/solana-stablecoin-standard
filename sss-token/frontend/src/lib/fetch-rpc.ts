/**
 * Fetch stablecoins directly from RPC using getProgramAccounts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { PROGRAM_ID, CONFIG_DISCRIMINATOR } from './constants';
import { StablecoinConfig, StablecoinWithSupply } from './types';

/**
 * Decode a Borsh-encoded string from buffer at offset
 * Returns [string, newOffset]
 */
function decodeString(buffer: Buffer, offset: number): [string, number] {
  const length = buffer.readUInt32LE(offset);
  const str = buffer.toString('utf8', offset + 4, offset + 4 + length);
  return [str, offset + 4 + length];
}

/**
 * Decode StablecoinConfig account data
 * Layout matches the Anchor account structure
 */
function decodeStablecoinConfig(data: Buffer, address: PublicKey): StablecoinConfig {
  let offset = 8; // Skip discriminator

  const masterAuthority = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const mint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const [name, nameEnd] = decodeString(data, offset);
  offset = nameEnd;

  const [symbol, symbolEnd] = decodeString(data, offset);
  offset = symbolEnd;

  const [uri, uriEnd] = decodeString(data, offset);
  offset = uriEnd;

  const decimals = data.readUInt8(offset);
  offset += 1;

  const paused = data.readUInt8(offset) === 1;
  offset += 1;

  const bump = data.readUInt8(offset);
  offset += 1;

  const enablePermanentDelegate = data.readUInt8(offset) === 1;
  offset += 1;

  const enableTransferHook = data.readUInt8(offset) === 1;
  offset += 1;

  const defaultAccountFrozen = data.readUInt8(offset) === 1;
  offset += 1;

  const blacklister = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const pauser = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const seizer = new PublicKey(data.slice(offset, offset + 32)).toBase58();

  return {
    address: address.toBase58(),
    masterAuthority,
    mint,
    name,
    symbol,
    uri,
    decimals,
    paused,
    bump,
    enablePermanentDelegate,
    enableTransferHook,
    defaultAccountFrozen,
    blacklister,
    pauser,
    seizer,
  };
}

/**
 * Fetch all stablecoin configs from the program
 */
export async function fetchStablecoinsFromRPC(
  connection: Connection
): Promise<StablecoinWithSupply[]> {
  const programId = new PublicKey(PROGRAM_ID);

  // Use bs58 encoding for the discriminator (Solana RPC expects base58)
  const discriminatorBs58 = bs58.encode(CONFIG_DISCRIMINATOR);
  
  // Fetch all accounts owned by the program with config discriminator
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: discriminatorBs58,
        },
      },
    ],
  });

  // Decode each account
  const stablecoins: StablecoinWithSupply[] = [];

  for (const { pubkey, account } of accounts) {
    try {
      const config = decodeStablecoinConfig(account.data, pubkey);
      
      // Fetch mint supply
      let supply = BigInt(0);
      try {
        const mintInfo = await connection.getTokenSupply(new PublicKey(config.mint));
        supply = BigInt(mintInfo.value.amount);
      } catch {
        // Mint might not exist or error fetching
      }

      stablecoins.push({
        ...config,
        supply,
      });
    } catch (error) {
      console.error(`Failed to decode account ${pubkey.toBase58()}:`, error);
    }
  }

  return stablecoins;
}

/**
 * Fetch a single stablecoin by mint address
 */
export async function fetchStablecoinByMint(
  connection: Connection,
  mintAddress: string
): Promise<StablecoinWithSupply | null> {
  const programId = new PublicKey(PROGRAM_ID);
  const mint = new PublicKey(mintAddress);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config'), mint.toBuffer()],
    programId
  );

  try {
    const accountInfo = await connection.getAccountInfo(configPda);
    if (!accountInfo) {
      return null;
    }

    const config = decodeStablecoinConfig(accountInfo.data, configPda);

    // Fetch mint supply
    let supply = BigInt(0);
    try {
      const mintInfo = await connection.getTokenSupply(mint);
      supply = BigInt(mintInfo.value.amount);
    } catch {
      // Mint might not exist
    }

    return {
      ...config,
      supply,
    };
  } catch (error) {
    console.error(`Failed to fetch stablecoin for mint ${mintAddress}:`, error);
    return null;
  }
}