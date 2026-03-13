#!/usr/bin/env npx ts-node

/**
 * Setup Test Wallets Script
 * 
 * This script sets up a complete testing environment for the SSS Token frontend:
 * 1. Generates keypairs for all authority roles
 * 2. Saves keypairs to JSON files for import into wallets
 * 3. Funds all accounts via airdrop
 * 4. Creates a Token-2022 mint with proper extensions
 * 5. Initializes the stablecoin config
 * 6. Assigns roles (blacklister, pauser, seizer)
 * 7. Adds a minter with quota
 * 8. Mints initial tokens to test user
 * 
 * Usage:
 *   npm run setup:test-wallets
 *   
 * Or directly:
 *   npx ts-node scripts/setup-test-wallets.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializePermanentDelegateInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import { AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

// Import SDK using require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdkPkg = require("../sdk/dist/index.js");
const { 
  SSSTokenClient, 
  findPermanentDelegatePDA, 
  findFreezeAuthorityPDA,
  SSS_TOKEN_PROGRAM_ID 
} = sdkPkg;

// Configuration
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899";
const WALLETS_DIR = path.join(__dirname, "test-wallets");
const CONFIG_FILE = path.join(WALLETS_DIR, "config.json");

// Keypair names
const KEYPAIR_NAMES = [
  "authority",
  "blacklister", 
  "pauser",
  "seizer",
  "minter",
  "user",
  "treasury",
] as const;

interface TestConfig {
  mint: string;
  network: string;
  createdAt: string;
  keypairs: {
    authority: string;
    blacklister: string;
    pauser: string;
    seizer: string;
    minter: string;
    user: string;
    treasury: string;
  };
  tokenAccount?: {
    user: string;
    treasury: string;
  };
  stablecoin?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

/**
 * Save a keypair to a JSON file
 */
function saveKeypair(name: string, keypair: Keypair): void {
  const filePath = path.join(WALLETS_DIR, `${name}.json`);
  const secretKey = Array.from(keypair.secretKey);
  fs.writeFileSync(filePath, JSON.stringify(secretKey, null, 2));
  console.log(`  ✓ Saved ${name} to ${filePath}`);
}

/**
 * Load a keypair from a JSON file
 */
function loadKeypair(name: string): Keypair {
  const filePath = path.join(WALLETS_DIR, `${name}.json`);
  const secretKey = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/**
 * Ensure wallets directory exists
 */
function ensureWalletsDir(): void {
  if (!fs.existsSync(WALLETS_DIR)) {
    fs.mkdirSync(WALLETS_DIR, { recursive: true });
    console.log(`Created directory: ${WALLETS_DIR}`);
  }
}

/**
 * Check if wallets already exist
 */
function walletsExist(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

/**
 * Airdrop SOL to a public key
 */
async function airdrop(connection: Connection, pubkey: PublicKey, amount: number = 2 * LAMPORTS_PER_SOL): Promise<void> {
  const balance = await connection.getBalance(pubkey);
  if (balance < LAMPORTS_PER_SOL) {
    console.log(`  Airdropping ${amount / LAMPORTS_PER_SOL} SOL to ${pubkey.toString().slice(0, 8)}...`);
    const signature = await connection.requestAirdrop(pubkey, amount);
    await connection.confirmTransaction(signature, "confirmed");
  }
}

/**
 * Create a Token-2022 mint with PermanentDelegate extension
 */
async function createMintWithExtensions(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number,
  programId: PublicKey
): Promise<PublicKey> {
  console.log("  Creating mint with PermanentDelegate extension...");
  
  const mintKeypair = Keypair.generate();
  
  // Derive PDAs
  const { pda: permanentDelegate } = findPermanentDelegatePDA(mintKeypair.publicKey, programId);
  const { pda: freezeAuthority } = findFreezeAuthorityPDA(mintKeypair.publicKey, programId);
  
  console.log(`    Mint: ${mintKeypair.publicKey.toString()}`);
  console.log(`    Permanent Delegate PDA: ${permanentDelegate.toString()}`);
  console.log(`    Freeze Authority PDA: ${freezeAuthority.toString()}`);
  
  // Calculate mint size
  const extensions = [ExtensionType.PermanentDelegate];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
  
  // Build transaction
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializePermanentDelegateInstruction(
      mintKeypair.publicKey,
      permanentDelegate,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );
  
  await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair], {
    commitment: "confirmed",
  });
  
  return mintKeypair.publicKey;
}

/**
 * Main setup function
 */
async function setup(): Promise<void> {
  console.log("\n🚀 SSS Token Test Wallets Setup\n");
  console.log("=".repeat(50));
  
  // Ensure directory exists
  ensureWalletsDir();
  
  // Connect to network
  console.log(`\n📡 Connecting to: ${RPC_URL}`);
  const connection = new Connection(RPC_URL, "confirmed");
  
  // Check if wallets already exist
  if (walletsExist()) {
    console.log("\n⚠️  Wallets already exist!");
    const config: TestConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    console.log(`  Mint: ${config.mint}`);
    console.log(`  Created: ${config.createdAt}`);
    console.log("\n  To recreate, delete the test-wallets directory first:");
    console.log(`    rm -rf ${WALLETS_DIR}`);
    console.log("\n  Current keypairs:");
    for (const [name, pubkey] of Object.entries(config.keypairs)) {
      console.log(`    ${name}: ${pubkey}`);
    }
    return;
  }
  
  // Step 1: Generate keypairs
  console.log("\n📝 Step 1: Generating keypairs...");
  const keypairs: Record<string, Keypair> = {};
  for (const name of KEYPAIR_NAMES) {
    keypairs[name] = Keypair.generate();
    saveKeypair(name, keypairs[name]);
  }
  
  // Step 2: Fund all accounts
  console.log("\n💰 Step 2: Funding accounts via airdrop...");
  for (const name of KEYPAIR_NAMES) {
    await airdrop(connection, keypairs[name].publicKey);
  }
  console.log("  ✓ All accounts funded");
  
  // Step 3: Create provider and SDK client
  console.log("\n🔧 Step 3: Setting up SDK client...");
  const wallet = new Wallet(keypairs.authority);
  const provider = new AnchorProvider(connection, wallet, {});
  const sdk = new SSSTokenClient({ provider });
  
  // Step 4: Create mint with extensions
  console.log("\n🪙  Step 4: Creating Token-2022 mint...");
  const programId = new PublicKey(SSS_TOKEN_PROGRAM_ID);
  const mint = await createMintWithExtensions(
    connection,
    keypairs.authority,
    keypairs.authority.publicKey,
    6,
    programId
  );
  console.log(`  ✓ Mint created: ${mint.toString()}`);
  
  // Step 5: Initialize stablecoin config
  console.log("\n⚙️  Step 5: Initializing stablecoin config...");
  const initParams = {
    name: "Test Stablecoin",
    symbol: "TST",
    uri: "https://example.com/tst.json",
    decimals: 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
  };
  
  const initTx = await sdk.initialize(mint, keypairs.authority, initParams);
  await connection.confirmTransaction(initTx, "confirmed");
  console.log(`  ✓ Config initialized: ${initTx}`);
  
  // Step 6: Update roles
  console.log("\n👤 Step 6: Assigning roles...");
  const rolesTx = await sdk.updateRoles(mint, keypairs.authority, {
    newBlacklister: keypairs.blacklister.publicKey,
    newPauser: keypairs.pauser.publicKey,
    newSeizer: keypairs.seizer.publicKey,
  });
  await connection.confirmTransaction(rolesTx, "confirmed");
  console.log(`  ✓ Roles assigned: ${rolesTx}`);
  console.log(`    Blacklister: ${keypairs.blacklister.publicKey.toString()}`);
  console.log(`    Pauser: ${keypairs.pauser.publicKey.toString()}`);
  console.log(`    Seizer: ${keypairs.seizer.publicKey.toString()}`);
  
  // Step 7: Add minter with quota
  console.log("\n🏦 Step 7: Adding minter...");
  const addMinterTx = await sdk.addMinter(mint, keypairs.authority, {
    minter: keypairs.minter.publicKey,
    quota: new BN(1_000_000_000_000), // 1 million tokens
  });
  await connection.confirmTransaction(addMinterTx, "confirmed");
  console.log(`  ✓ Minter added with quota: 1,000,000 TST`);
  
  // Step 8: Create token accounts
  console.log("\n📂 Step 8: Creating token accounts...");
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    keypairs.authority,
    mint,
    keypairs.user.publicKey,
    undefined,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`  ✓ User token account: ${userTokenAccount.address.toString()}`);
  
  const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    keypairs.authority,
    mint,
    keypairs.treasury.publicKey,
    undefined,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`  ✓ Treasury token account: ${treasuryTokenAccount.address.toString()}`);
  
  // Step 9: Mint initial tokens to user
  console.log("\n💎 Step 9: Minting initial tokens...");
  const mintTx = await sdk.mintTokens(
    mint,
    keypairs.authority,
    keypairs.minter.publicKey,
    userTokenAccount.address,
    { amount: new BN(10_000_000) } // 10 tokens
  );
  await connection.confirmTransaction(mintTx, "confirmed");
  console.log(`  ✓ Minted 10 TST to user`);
  
  // Step 10: Save configuration
  console.log("\n💾 Step 10: Saving configuration...");
  const config: TestConfig = {
    mint: mint.toString(),
    network: RPC_URL,
    createdAt: new Date().toISOString(),
    keypairs: {
      authority: keypairs.authority.publicKey.toString(),
      blacklister: keypairs.blacklister.publicKey.toString(),
      pauser: keypairs.pauser.publicKey.toString(),
      seizer: keypairs.seizer.publicKey.toString(),
      minter: keypairs.minter.publicKey.toString(),
      user: keypairs.user.publicKey.toString(),
      treasury: keypairs.treasury.publicKey.toString(),
    },
    tokenAccount: {
      user: userTokenAccount.address.toString(),
      treasury: treasuryTokenAccount.address.toString(),
    },
    stablecoin: {
      name: initParams.name,
      symbol: initParams.symbol,
      decimals: initParams.decimals,
    },
  };
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`  ✓ Config saved to ${CONFIG_FILE}`);
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Setup Complete!\n");
  console.log("📋 Summary:");
  console.log(`   Mint: ${mint.toString()}`);
  console.log(`   Network: ${RPC_URL}`);
  console.log("\n📁 Keypair files (import into wallets):");
  for (const name of KEYPAIR_NAMES) {
    console.log(`   ${WALLETS_DIR}/${name}.json`);
  }
  console.log("\n🔐 To import into Phantom/Solflare:");
  console.log("   1. Open wallet settings");
  console.log("   2. Import existing wallet");
  console.log("   3. Select the JSON file or paste private key");
  console.log("\n🌐 Frontend Testing:");
  console.log(`   1. Update frontend/.env.local:`);
  console.log(`      NEXT_PUBLIC_MINT_ADDRESS=${mint.toString()}`);
  console.log(`   2. Start frontend: cd frontend && npm run dev`);
  console.log(`   3. Open http://localhost:3000/admin`);
  console.log(`   4. Connect with authority wallet to test operations`);
  console.log("\n" + "=".repeat(50) + "\n");
}

// Run setup
setup().catch((error) => {
  console.error("\n❌ Setup failed:", error.message);
  console.error(error);
  process.exit(1);
});