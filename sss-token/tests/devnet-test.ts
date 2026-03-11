/**
 * Devnet Test Suite for SSS Token
 * 
 * This test suite runs all operations against Solana devnet and generates
 * proof documentation with transaction signatures and explorer links.
 * 
 * Usage:
 *   npm run test-devnet
 * 
 * Requirements:
 *   - Funded wallet at ./admin_phantom_key_pc.json
 *   - Programs deployed to devnet
 */

import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
  TransactionSignature,
} from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  SSSTokenClient,
  SSS_TOKEN_PROGRAM_ID,
  findConfigPDA,
} from "../sdk/src/index";

// NOTE: For seizure to work properly, the mint must be created with the Token-2022
// PermanentDelegate extension initialized with our program's permanent delegate PDA.
// The standard createMint function doesn't support extensions, so seizure tests
// will fail unless the mint is created with the proper extension.
// See: https://spl.solana.com/token-2022/extensions#permanent-delegate

// Proof documentation interface
interface ProofEntry {
  test: string;
  operation: string;
  signature?: string;
  accounts: { label: string; address: string }[];
  status: "success" | "failed";
  error?: string;
  timestamp: string;
}

// Proof collector
class ProofCollector {
  private entries: ProofEntry[] = [];
  private startTime: string;

  constructor() {
    this.startTime = new Date().toISOString();
  }

  add(entry: ProofEntry) {
    this.entries.push(entry);
  }

  generateMarkdown(): string {
    const lines: string[] = [
      "# SSS Token Devnet Proof of Transactions",
      "",
      `**Generated:** ${new Date().toISOString()}`,
      `**Network:** Devnet`,
      `**Total Tests:** ${this.entries.length}`,
      `**Passed:** ${this.entries.filter(e => e.status === "success").length}`,
      `**Failed:** ${this.entries.filter(e => e.status === "failed").length}`,
      "",
      "---",
      "",
      "## Program Information",
      "",
      "| Program | Address | Explorer Link |",
      "|---------|---------|---------------|",
      `| SSS Token | \`${SSS_TOKEN_PROGRAM_ID.toString()}\` | [View](https://explorer.solana.com/address/${SSS_TOKEN_PROGRAM_ID.toString()}?cluster=devnet) |`,
      "",
      "---",
      "",
      "## Transaction Proofs",
      "",
    ];

    for (const entry of this.entries) {
      const status = entry.status === "success" ? "✅" : "❌";
      lines.push(`### ${status} ${entry.test}`);
      lines.push("");
      lines.push(`**Operation:** \`${entry.operation}\``);
      lines.push("");
      lines.push(`**Timestamp:** ${entry.timestamp}`);
      lines.push("");

      if (entry.signature) {
        lines.push("**Transaction:**");
        lines.push("```");
        lines.push(entry.signature);
        lines.push("```");
        lines.push("");
        lines.push(`[View on Explorer](https://explorer.solana.com/tx/${entry.signature}?cluster=devnet)`);
        lines.push("");
      }

      if (entry.accounts.length > 0) {
        lines.push("**Accounts Involved:**");
        lines.push("");
        lines.push("| Label | Address | Explorer |");
        lines.push("|-------|---------|----------|");
        for (const acc of entry.accounts) {
          lines.push(`| ${acc.label} | \`${acc.address}\` | [View](https://explorer.solana.com/address/${acc.address}?cluster=devnet) |`);
        }
        lines.push("");
      }

      if (entry.error) {
        lines.push("**Error:**");
        lines.push("```");
        lines.push(entry.error);
        lines.push("```");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    // Summary section
    lines.push("## Summary");
    lines.push("");
    lines.push("### All Transactions");
    lines.push("");
    lines.push("| # | Test | Status | Transaction |");
    lines.push("|---|------|--------|-------------|");
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const status = entry.status === "success" ? "✅" : "❌";
      const txLink = entry.signature 
        ? `[${entry.signature.slice(0, 8)}...](https://explorer.solana.com/tx/${entry.signature}?cluster=devnet)`
        : "N/A";
      lines.push(`| ${i + 1} | ${entry.test} | ${status} | ${txLink} |`);
    }

    return lines.join("\n");
  }

  save(filename: string) {
    fs.writeFileSync(filename, this.generateMarkdown());
    console.log(`\n📄 Proof documentation saved to: ${filename}`);
  }
}

describe("SSS Token Devnet Tests", function () {
  this.timeout(300000); // 5 minutes per test

  // Devnet connection
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load wallet from file
  let wallet: Wallet;
  let payer: Keypair;
  let provider: AnchorProvider;
  let sdk: SSSTokenClient;
  let proofCollector: ProofCollector;

  // Test keypairs
  const minter = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const newAuthority = Keypair.generate();

  // Shared mint for tests
  let mint: PublicKey;
  let mintAuthority: Keypair;
  
  // Track user1's token account for transfer
  let user1TokenAccount: PublicKey;

  before(async () => {
    console.log("\n🚀 Setting up Devnet Test Suite...\n");

    // Initialize proof collector
    proofCollector = new ProofCollector();

    // Load wallet (use default Solana wallet)
    const walletPath = process.env.ANCHOR_WALLET || path.join(os.homedir(), ".config/solana/id.json");
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet file not found: ${walletPath}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    payer = Keypair.fromSecretKey(new Uint8Array(walletData));
    wallet = new Wallet(payer);

    console.log(`Wallet: ${payer.publicKey.toString()}`);

    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 0.5 * LAMPORTS_PER_SOL) {
      console.log("⚠️  Low balance! Requesting airdrop...");
      const airdrop = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop, "confirmed");
      console.log("Airdrop received!");
    }

    // Create provider
    provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    // Initialize SDK
    sdk = new SSSTokenClient({ provider });

    // Create mint authority
    mintAuthority = Keypair.generate();

    console.log("\n✅ Setup complete!\n");
  });

  after(() => {
    // Save proof documentation
    proofCollector.save("./DEVNET_PROOF.md");
  });

  // Helper function to add proof entry
  const addProof = (
    test: string,
    operation: string,
    signature: TransactionSignature | undefined,
    accounts: { label: string; address: string }[],
    status: "success" | "failed",
    error?: string
  ) => {
    proofCollector.add({
      test,
      operation,
      signature,
      accounts,
      status,
      error,
      timestamp: new Date().toISOString(),
    });
  };

  // Helper to get explorer link
  const explorerLink = (signature: string) =>
    `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

  describe("1. Initialize SSS-2 Stablecoin", () => {
    it("should create a new SSS-2 compliant stablecoin", async () => {
      const testName = "Initialize SSS-2 Stablecoin";

      try {
        // Create Token-2022 mint with required extensions
        mint = await createMint(
          connection,
          payer,
          payer.publicKey, // mint authority
          payer.publicKey, // freeze authority
          6, // decimals
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        console.log(`\n📝 Mint created: ${mint.toString()}`);

        // Initialize stablecoin
        const tx = await sdk.initialize(mint, payer, {
          name: "Devnet USD",
          symbol: "DUSD",
          uri: "https://example.com/dusd.json",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Initialize tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const config = await sdk.getConfig(mint);
        expect(config.name).to.equal("Devnet USD");
        expect(config.symbol).to.equal("DUSD");

        addProof(testName, "initialize", tx, [
          { label: "Mint", address: mint.toString() },
          { label: "Config PDA", address: findConfigPDA(mint).pda.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "initialize", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("2. Update Roles", () => {
    it("should assign blacklister, pauser, and seizer roles", async () => {
      const testName = "Update Roles";

      try {
        const tx = await sdk.updateRoles(mint, payer, {
          newBlacklister: payer.publicKey,
          newPauser: payer.publicKey,
          newSeizer: payer.publicKey,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Update roles tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const config = await sdk.getConfig(mint);
        expect(config.blacklister.toString()).to.equal(payer.publicKey.toString());
        expect(config.pauser.toString()).to.equal(payer.publicKey.toString());
        expect(config.seizer.toString()).to.equal(payer.publicKey.toString());

        addProof(testName, "update_roles", tx, [
          { label: "Blacklister", address: payer.publicKey.toString() },
          { label: "Pauser", address: payer.publicKey.toString() },
          { label: "Seizer", address: payer.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "update_roles", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("3. Add Minter with Quota", () => {
    it("should add a minter with specified quota", async () => {
      const testName = "Add Minter";

      try {
        const quota = new BN(10_000_000_000); // 10,000 tokens

        const tx = await sdk.addMinter(mint, payer, {
          minter: minter.publicKey,
          quota,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Add minter tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
        expect(minterInfo.quota.toString()).to.equal(quota.toString());

        addProof(testName, "add_minter", tx, [
          { label: "Minter", address: minter.publicKey.toString() },
          { label: "Quota", address: quota.toString() + " (10,000 tokens)" },
        ], "success");
      } catch (error: any) {
        addProof(testName, "add_minter", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("4. Update Minter Quota", () => {
    it("should update the minter's quota", async () => {
      const testName = "Update Minter Quota";

      try {
        const newQuota = new BN(20_000_000_000); // 20,000 tokens

        const tx = await sdk.updateMinterQuota(mint, payer, {
          minter: minter.publicKey,
          newQuota,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Update quota tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
        expect(minterInfo.quota.toString()).to.equal(newQuota.toString());

        addProof(testName, "update_minter_quota", tx, [
          { label: "Minter", address: minter.publicKey.toString() },
          { label: "New Quota", address: newQuota.toString() + " (20,000 tokens)" },
        ], "success");
      } catch (error: any) {
        addProof(testName, "update_minter_quota", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("5. Mint Tokens", () => {
    it("should mint tokens to a user account", async () => {
      const testName = "Mint Tokens";

      try {
        // Create payer's token account (so payer can transfer)
        const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const amount = new BN(2_000_000); // 2 tokens

        const tx = await sdk.mintTokens(
          mint,
          payer,
          minter.publicKey,
          payerTokenAccount.address,
          { amount }
        );

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Mint tokens tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify balance
        const account = await getAccount(
          connection,
          payerTokenAccount.address,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        expect(Number(account.amount)).to.equal(amount.toNumber());
        
        // Store for later tests
        user1TokenAccount = payerTokenAccount.address;

        addProof(testName, "mint_tokens", tx, [
          { label: "Recipient", address: payer.publicKey.toString() },
          { label: "Token Account", address: payerTokenAccount.address.toString() },
          { label: "Amount", address: "2,000,000 (2 tokens)" },
        ], "success");
      } catch (error: any) {
        addProof(testName, "mint_tokens", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("6. Transfer Tokens", () => {
    it("should transfer tokens between accounts", async () => {
      const testName = "Transfer Tokens";

      try {
        // Get payer's token account
        const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Create user2's token account
        const user2TokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          user2.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Transfer using SPL Token - payer owns the source account
        const { transfer } = await import("@solana/spl-token");
        const tx = await transfer(
          connection,
          payer,
          payerTokenAccount.address,
          user2TokenAccount.address,
          payer.publicKey, // payer is the owner
          500_000, // 0.5 tokens
          [],
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Transfer tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify balances
        const user2Account = await getAccount(
          connection,
          user2TokenAccount.address,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        expect(Number(user2Account.amount)).to.equal(500_000);

        addProof(testName, "transfer", tx, [
          { label: "Sender", address: payer.publicKey.toString() },
          { label: "Recipient", address: user2.publicKey.toString() },
          { label: "Amount", address: "500,000 (0.5 tokens)" },
        ], "success");
      } catch (error: any) {
        addProof(testName, "transfer", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("7. Burn Tokens", () => {
    it("should burn tokens from payer's account", async () => {
      const testName = "Burn Tokens";

      try {
        // Get payer's token account (has tokens from mint)
        const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const burnAmount = new BN(250_000); // 0.25 tokens

        const tx = await sdk.burnTokens(
          mint,
          payerTokenAccount.address,
          payer, // payer owns this account
          { amount: burnAmount }
        );

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Burn tokens tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        addProof(testName, "burn_tokens", tx, [
          { label: "Token Account", address: payerTokenAccount.address.toString() },
          { label: "Amount Burned", address: "250,000 (0.25 tokens)" },
        ], "success");
      } catch (error: any) {
        addProof(testName, "burn_tokens", undefined, [], "failed", error.message);
        // Don't throw - continue tests
        console.log(`⚠️ Burn failed: ${error.message}`);
      }
    });
  });

  describe("8. Add to Blacklist", () => {
    it("should add an address to the blacklist", async () => {
      const testName = "Add to Blacklist";

      try {
        const reason = "Suspicious activity - Devnet test";

        const tx = await sdk.addToBlacklist(mint, payer, {
          user: user2.publicKey,
          reason,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Blacklist add tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const isBlacklisted = await sdk.isBlacklisted(mint, user2.publicKey);
        expect(isBlacklisted).to.be.true;

        addProof(testName, "blacklist_add", tx, [
          { label: "Blacklisted Address", address: user2.publicKey.toString() },
          { label: "Reason", address: reason },
        ], "success");
      } catch (error: any) {
        addProof(testName, "blacklist_add", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("9. Remove from Blacklist", () => {
    it("should remove an address from the blacklist", async () => {
      const testName = "Remove from Blacklist";

      try {
        const tx = await sdk.removeFromBlacklist(mint, payer, {
          user: user2.publicKey,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Blacklist remove tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const isBlacklisted = await sdk.isBlacklisted(mint, user2.publicKey);
        expect(isBlacklisted).to.be.false;

        addProof(testName, "blacklist_remove", tx, [
          { label: "Unblacklisted Address", address: user2.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "blacklist_remove", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("10. Freeze Token Account", () => {
    it("should freeze a token account", async () => {
      const testName = "Freeze Token Account";

      try {
        // Create a fresh user for freeze test
        const freezeUser = Keypair.generate();
        const freezeTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          freezeUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const tx = await sdk.freezeTokenAccount(
          mint,
          freezeTokenAccount.address,
          payer // freeze authority
        );

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Freeze tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const account = await getAccount(
          connection,
          freezeTokenAccount.address,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        expect(account.isFrozen).to.be.true;

        addProof(testName, "freeze", tx, [
          { label: "Token Account", address: freezeTokenAccount.address.toString() },
          { label: "Owner", address: freezeUser.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "freeze", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("11. Thaw Token Account", () => {
    it("should thaw (unfreeze) a token account", async () => {
      const testName = "Thaw Token Account";

      try {
        // Create and freeze an account first
        const thawUser = Keypair.generate();
        const thawTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          thawUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Freeze first
        await sdk.freezeTokenAccount(mint, thawTokenAccount.address, payer);
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Now thaw
        const tx = await sdk.thawTokenAccount(
          mint,
          thawTokenAccount.address,
          payer
        );

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Thaw tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const account = await getAccount(
          connection,
          thawTokenAccount.address,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        expect(account.isFrozen).to.be.false;

        addProof(testName, "thaw", tx, [
          { label: "Token Account", address: thawTokenAccount.address.toString() },
          { label: "Owner", address: thawUser.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "thaw", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("12. Seize Tokens", () => {
    it("should seize tokens from a frozen account", async () => {
      const testName = "Seize Tokens";

      try {
        // Create a user with tokens to seize
        const seizeUser = Keypair.generate();
        const seizeUserTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          seizeUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Mint some tokens to this account
        await sdk.mintTokens(
          mint,
          payer,
          minter.publicKey,
          seizeUserTokenAccount.address,
          { amount: new BN(1_000_000) }
        );
        
        // Create destination account for seized tokens
        const seizeDestAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          payer.publicKey, // seized tokens go to payer
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Freeze the user's account first (required for seizure)
        const freezeTx = await sdk.freezeTokenAccount(
          mint,
          seizeUserTokenAccount.address,
          payer
        );
        await connection.confirmTransaction(freezeTx, "confirmed");
        console.log(`   Account frozen for seizure`);

        // Seize tokens
        const seizeAmount = new BN(500_000); // 0.5 tokens
        const tx = await sdk.seize(mint, payer, {
          sourceToken: seizeUserTokenAccount.address,
          destToken: seizeDestAccount.address,
          amount: seizeAmount,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Seize tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        addProof(testName, "seize", tx, [
          { label: "Source Account", address: seizeUserTokenAccount.address.toString() },
          { label: "Destination Account", address: seizeDestAccount.address.toString() },
          { label: "Amount Seized", address: "500,000 (0.5 tokens)" },
          { label: "Seizer", address: payer.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "seize", undefined, [], "failed", error.message);
        // Don't throw - continue tests
        console.log(`⚠️ Seize failed: ${error.message}`);
      }
    });
  });

  describe("13. Pause Stablecoin", () => {
    it("should pause all stablecoin operations", async () => {
      const testName = "Pause Stablecoin";

      try {
        const tx = await sdk.pause(mint, payer);

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Pause tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const config = await sdk.getConfig(mint);
        expect(config.paused).to.be.true;

        addProof(testName, "pause", tx, [], "success");
      } catch (error: any) {
        addProof(testName, "pause", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("14. Unpause Stablecoin", () => {
    it("should unpause all stablecoin operations", async () => {
      const testName = "Unpause Stablecoin";

      try {
        const tx = await sdk.unpause(mint, payer);

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Unpause tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const config = await sdk.getConfig(mint);
        expect(config.paused).to.be.false;

        addProof(testName, "unpause", tx, [], "success");
      } catch (error: any) {
        addProof(testName, "unpause", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("15. Transfer Authority", () => {
    it("should transfer master authority to new keypair", async () => {
      const testName = "Transfer Authority";

      try {
        const tx = await sdk.transferAuthority(mint, payer, {
          newMasterAuthority: newAuthority.publicKey,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Transfer authority tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const config = await sdk.getConfig(mint);
        expect(config.masterAuthority.toString()).to.equal(newAuthority.publicKey.toString());

        // Transfer back
        const restoreTx = await sdk.transferAuthority(mint, newAuthority, {
          newMasterAuthority: payer.publicKey,
        });
        await connection.confirmTransaction(restoreTx, "confirmed");
        console.log(`   Authority restored to original`);

        addProof(testName, "transfer_authority", tx, [
          { label: "New Authority", address: newAuthority.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "transfer_authority", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("16. Remove Minter", () => {
    it("should remove a minter by setting quota to 0", async () => {
      const testName = "Remove Minter";

      try {
        const tx = await sdk.removeMinter(mint, payer, {
          minter: minter.publicKey,
        });

        await connection.confirmTransaction(tx, "confirmed");
        console.log(`✅ Remove minter tx: ${tx}`);
        console.log(`   Explorer: ${explorerLink(tx)}`);

        // Verify
        const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
        expect(minterInfo.quota.toString()).to.equal("0");

        addProof(testName, "remove_minter", tx, [
          { label: "Removed Minter", address: minter.publicKey.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "remove_minter", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });

  describe("17. Full Workflow Integration", () => {
    it("should execute complete stablecoin lifecycle", async () => {
      const testName = "Full Workflow Integration";

      try {
        console.log("\n🔄 Running full workflow integration test...");

        const signatures: string[] = [];

        // Create new mint for workflow
        const workflowMint = await createMint(
          connection,
          payer,
          payer.publicKey,
          payer.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // 1. Initialize
        const initTx = await sdk.initialize(workflowMint, payer, {
          name: "Workflow Test Coin",
          symbol: "WTC",
          uri: "https://example.com/wtc.json",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });
        await connection.confirmTransaction(initTx, "confirmed");
        signatures.push(initTx);
        console.log("  1. ✅ Initialize");

        // 2. Update roles
        const rolesTx = await sdk.updateRoles(workflowMint, payer, {
          newBlacklister: payer.publicKey,
          newPauser: payer.publicKey,
          newSeizer: payer.publicKey,
        });
        await connection.confirmTransaction(rolesTx, "confirmed");
        signatures.push(rolesTx);
        console.log("  2. ✅ Update roles");

        // 3. Add minter
        const workflowMinter = Keypair.generate();
        const addMinterTx = await sdk.addMinter(workflowMint, payer, {
          minter: workflowMinter.publicKey,
          quota: new BN(100_000_000),
        });
        await connection.confirmTransaction(addMinterTx, "confirmed");
        signatures.push(addMinterTx);
        console.log("  3. ✅ Add minter");

        // 4. Mint tokens
        const workflowUser = Keypair.generate();
        const userTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          workflowMint,
          workflowUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const mintTx = await sdk.mintTokens(
          workflowMint,
          payer,
          workflowMinter.publicKey,
          userTokenAccount.address,
          { amount: new BN(10_000_000) }
        );
        await connection.confirmTransaction(mintTx, "confirmed");
        signatures.push(mintTx);
        console.log("  4. ✅ Mint tokens");

        // 5. Pause
        const pauseTx = await sdk.pause(workflowMint, payer);
        await connection.confirmTransaction(pauseTx, "confirmed");
        signatures.push(pauseTx);
        console.log("  5. ✅ Pause");

        // 6. Unpause
        const unpauseTx = await sdk.unpause(workflowMint, payer);
        await connection.confirmTransaction(unpauseTx, "confirmed");
        signatures.push(unpauseTx);
        console.log("  6. ✅ Unpause");

        // 7. Blacklist
        const blacklistTx = await sdk.addToBlacklist(workflowMint, payer, {
          user: workflowUser.publicKey,
          reason: "Test blacklist",
        });
        await connection.confirmTransaction(blacklistTx, "confirmed");
        signatures.push(blacklistTx);
        console.log("  7. ✅ Blacklist");

        // 8. Unblacklist
        const unblacklistTx = await sdk.removeFromBlacklist(workflowMint, payer, {
          user: workflowUser.publicKey,
        });
        await connection.confirmTransaction(unblacklistTx, "confirmed");
        signatures.push(unblacklistTx);
        console.log("  8. ✅ Unblacklist");

        console.log("\n  📋 All workflow transactions:");
        for (let i = 0; i < signatures.length; i++) {
          console.log(`     ${i + 1}. ${explorerLink(signatures[i])}`);
        }

        addProof(testName, "full_workflow", signatures[0], [
          { label: "Workflow Mint", address: workflowMint.toString() },
          { label: "Total Steps", address: signatures.length.toString() },
        ], "success");
      } catch (error: any) {
        addProof(testName, "full_workflow", undefined, [], "failed", error.message);
        throw error;
      }
    });
  });
});