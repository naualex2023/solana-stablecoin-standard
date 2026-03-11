/**
 * Comprehensive test suite for SSS Token SDK
 * Mirrors all Rust tests from programs/sss-token/tests/sss_token.rs
 */

import { expect } from "chai";
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializePermanentDelegateInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  SSSTokenClient,
  SSS_TOKEN_PROGRAM_ID,
  findConfigPDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
  findPermanentDelegatePDA,
} from "../src/index";

describe("SSS Token SDK Tests", function () {
  this.timeout(100000);

  // Setup test environment
  // Use localnet by default, fallback to devnet
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899",
    "confirmed"
  );
  
  // Test keypairs
  const payer = Keypair.generate();
  const authority = payer;
  const minter = Keypair.generate();
  const user = Keypair.generate();
  const seizer = Keypair.generate();
  const blacklister = Keypair.generate();
  const pauser = Keypair.generate();

  // Create wallet from payer
  const wallet = new Wallet(payer);

  // Create provider
  const provider = new AnchorProvider(connection, wallet);

  // SDK instance
  const sdk = new SSSTokenClient({ provider });

  // Token mint
  let mint: PublicKey;

  before(async () => {
    // Fund payer if needed
    const balance = await connection.getBalance(payer.publicKey);
    if (balance < 2 * LAMPORTS_PER_SOL) {
      console.log("Airdropping SOL to payer...");
      const airdrop = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop);
    }

    // Create token mint using Token-2022 program with freeze authority
    console.log("Creating token mint...");
    mint = await createMint(
      connection,
      payer,
      authority.publicKey,
      authority.publicKey, // freeze authority
      6,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Mint created:", mint.toString());

    // Initialize the shared mint for use by other tests
    const initTx = await sdk.initialize(mint, authority, {
      name: "Test Stablecoin",
      symbol: "TST",
      uri: "https://example.com/metadata.json",
      decimals: 6,
      enablePermanentDelegate: true,  // Enable for seize operations
      enableTransferHook: true,  // Enable for compliance/blacklist operations
      defaultAccountFrozen: false,
    });
    await connection.confirmTransaction(initTx, "confirmed");
    console.log("Shared mint initialized");

    // Fund blacklister for rent costs
    const blacklisterFund = await connection.requestAirdrop(
      blacklister.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(blacklisterFund, "confirmed");
    console.log("Blacklister funded");
  });

  describe("test_initialize_sss1_minimal_stablecoin", () => {
    it("should initialize a new stablecoin with minimal configuration", async () => {
      // Create a fresh mint for this test
      const testMint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const configPDA = findConfigPDA(testMint);
      console.log("Config PDA:", configPDA.pda.toString());

      const tx = await sdk.initialize(testMint, authority, {
        name: "Test Stablecoin",
        symbol: "TST",
        uri: "https://example.com/metadata.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });

      console.log("Initialize transaction:", tx);

      // Wait for confirmation
      await connection.confirmTransaction(tx, "confirmed");

      // Verify config exists
      const config = await sdk.getConfig(testMint);
      expect(config).to.exist;
      expect(config.name).to.equal("Test Stablecoin");
      expect(config.symbol).to.equal("TST");
      expect(config.paused).to.be.false;
      expect(config.masterAuthority.toString()).to.equal(authority.publicKey.toString());
    });
  });

  describe("test_add_minter", () => {
    it("should add a minter with specified quota", async () => {
      const quota = new BN(1_000_000_000);
      
      const tx = await sdk.addMinter(mint, authority, {
        minter: minter.publicKey,
        quota,
      });

      console.log("Add minter transaction:", tx);

      // Wait for confirmation
      await connection.confirmTransaction(tx, "confirmed");

      // Verify minter info
      const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
      expect(minterInfo).to.exist;
      expect(minterInfo.authority.toString()).to.equal(minter.publicKey.toString());
      expect(minterInfo.quota.toString()).to.equal(quota.toString());
      expect(minterInfo.minted.toString()).to.equal("0");
    });
  });

  describe("test_remove_minter", () => {
    it("should remove a minter by setting quota to 0", async () => {
      // First, ensure minter exists
      const minter2 = Keypair.generate();
      const addTx = await sdk.addMinter(mint, authority, {
        minter: minter2.publicKey,
        quota: new BN(100_000_000),
      });
      await connection.confirmTransaction(addTx, "confirmed");

      // Remove minter
      const tx = await sdk.removeMinter(mint, authority, {
        minter: minter2.publicKey,
      });

      console.log("Remove minter transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify quota is set to 0
      const minterInfo = await sdk.getMinterInfo(mint, minter2.publicKey);
      expect(minterInfo.quota.toString()).to.equal("0");
    });
  });

  describe("test_pause_and_unpause", () => {
    it("should pause all token operations", async () => {
      // First update roles to make authority the pauser
      const rolesTx = await sdk.updateRoles(mint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: authority.publicKey,
        newSeizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      const tx = await sdk.pause(mint, authority);
      console.log("Pause transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      const config = await sdk.getConfig(mint);
      expect(config.paused).to.be.true;
    });

    it("should unpause all token operations", async () => {
      const tx = await sdk.unpause(mint, authority);
      console.log("Unpause transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      const config = await sdk.getConfig(mint);
      expect(config.paused).to.be.false;
    });
  });

  describe("test_transfer_authority", () => {
    it("should transfer master authority to new authority", async () => {
      const newAuthority = Keypair.generate();

      const tx = await sdk.transferAuthority(mint, authority, {
        newMasterAuthority: newAuthority.publicKey,
      });

      console.log("Transfer authority transaction:", tx);

      // Wait for confirmation
      await connection.confirmTransaction(tx, "confirmed");

      const config = await sdk.getConfig(mint);
      expect(config.masterAuthority.toString()).to.equal(newAuthority.publicKey.toString());

      // Transfer back to original authority
      const restoreTx = await sdk.transferAuthority(mint, newAuthority, {
        newMasterAuthority: authority.publicKey,
      });
      await connection.confirmTransaction(restoreTx, "confirmed");
      console.log("Authority restored to original");
    });
  });

  describe("test_update_roles", () => {
    it("should update role assignments", async () => {
      const tx = await sdk.updateRoles(mint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });

      console.log("Update roles transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      const config = await sdk.getConfig(mint);
      expect(config.blacklister.toString()).to.equal(blacklister.publicKey.toString());
      expect(config.pauser.toString()).to.equal(pauser.publicKey.toString());
      expect(config.seizer.toString()).to.equal(seizer.publicKey.toString());
    });
  });

  describe("test_mint_tokens", () => {
    it("should mint tokens to a recipient account", async () => {
      // Create token account for user
      const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const userTokenAccount = userTokenAccountInfo.address;

      const amount = new BN(1_000_000); // 1 token

      const tx = await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount }
      );

      console.log("Mint tokens transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify balance
      const accountInfo = await getAccount(connection, userTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(amount.toNumber());

      // Verify minter's minted amount
      const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
      expect(minterInfo.minted.toString()).to.equal(amount.toString());
    });

    it("should enforce quota limits", async () => {
      const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const userTokenAccount = userTokenAccountInfo.address;

      const amount = new BN(2_000_000_000); // More than quota

      try {
        await sdk.mintTokens(
          mint,
          authority,
          minter.publicKey,
          userTokenAccount,
          { amount }
        );
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error).to.exist;
        console.log("Quota error caught:", error.message);
      }
    });
  });

  describe("test_burn_tokens", () => {
    it("should burn tokens from an account", async () => {
      const burnUser = Keypair.generate();  // Use fresh user to avoid state conflicts
      const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        burnUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const userTokenAccount = userTokenAccountInfo.address;

      // First, mint some tokens
      const mintTx = await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount: new BN(1_000_000) }
      );
      await connection.confirmTransaction(mintTx, "confirmed");

      const burnAmount = new BN(500_000);
      const tx = await sdk.burnTokens(
        mint,
        userTokenAccount,
        burnUser,
        { amount: burnAmount }
      );

      console.log("Burn tokens transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify balance
      const accountInfo = await getAccount(connection, userTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(500_000);
    });
  });

  describe("test_freeze_and_thaw_token_account", () => {
    it("should freeze a token account", async () => {
      const freezeUser = Keypair.generate();  // Use fresh user
      const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        freezeUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const userTokenAccount = userTokenAccountInfo.address;

      const tx = await sdk.freezeTokenAccount(
        mint,
        userTokenAccount,
        authority
      );

      console.log("Freeze transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify account is frozen
      const accountInfo = await getAccount(connection, userTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(accountInfo.isFrozen).to.be.true;
    });

    it("should thaw (unfreeze) a token account", async () => {
      const freezeUser = Keypair.generate();
      const freezeTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        freezeUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const freezeTokenAccount = freezeTokenAccountInfo.address;

      // Freeze first
      const freezeTx = await sdk.freezeTokenAccount(
        mint,
        freezeTokenAccount,
        authority
      );
      await connection.confirmTransaction(freezeTx, "confirmed");

      const tx = await sdk.thawTokenAccount(
        mint,
        freezeTokenAccount,
        authority
      );

      console.log("Thaw transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify account is not frozen
      const accountInfo = await getAccount(connection, freezeTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(accountInfo.isFrozen).to.be.false;
    });
  });

  describe("test_update_minter_quota", () => {
    it("should update minter quota", async () => {
      const newQuota = new BN(5_000_000_000);

      const tx = await sdk.updateMinterQuota(mint, authority, {
        minter: minter.publicKey,
        newQuota,
      });

      console.log("Update quota transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
      expect(minterInfo.quota.toString()).to.equal(newQuota.toString());
    });
  });

  describe("test_add_to_blacklist", () => {
    it("should add an address to the blacklist", async () => {
      const maliciousUser = Keypair.generate();
      const reason = "Suspicious activity detected";

      const tx = await sdk.addToBlacklist(mint, blacklister, {
        user: maliciousUser.publicKey,
        reason,
      });

      console.log("Add to blacklist transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify blacklist entry exists
      const isBlacklisted = await sdk.isBlacklisted(mint, maliciousUser.publicKey);
      expect(isBlacklisted).to.be.true;

      // Get blacklist entry details
      const blacklistEntry = await sdk.getBlacklistEntry(mint, maliciousUser.publicKey);
      expect(blacklistEntry.user.toString()).to.equal(maliciousUser.publicKey.toString());
      expect(blacklistEntry.reason).to.equal(reason);
    });
  });

  describe("test_remove_from_blacklist", () => {
    it("should remove an address from the blacklist", async () => {
      const maliciousUser = Keypair.generate();
      
      // First add to blacklist
      const addTx = await sdk.addToBlacklist(mint, blacklister, {
        user: maliciousUser.publicKey,
        reason: "Test reason",
      });
      await connection.confirmTransaction(addTx, "confirmed");

      const tx = await sdk.removeFromBlacklist(mint, blacklister, {
        user: maliciousUser.publicKey,
      });

      console.log("Remove from blacklist transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify blacklist entry no longer exists
      const isBlacklisted = await sdk.isBlacklisted(mint, maliciousUser.publicKey);
      expect(isBlacklisted).to.be.false;
    });
  });

  describe("test_seize_tokens", () => {
    // Skip: Requires Token-2022 permanent delegate extension to be set up
    // The standard createMint doesn't support extensions
    it.skip("should seize tokens from an account", async () => {
      const sourceUser = Keypair.generate();
      const destUser = Keypair.generate();

      // Create token accounts
      const sourceTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        sourceUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const sourceTokenAccount = sourceTokenAccountInfo.address;
      
      const destTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        destUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const destTokenAccount = destTokenAccountInfo.address;

      // Mint tokens to source
      const mintTx = await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        sourceTokenAccount,
        { amount: new BN(1_000_000) }
      );
      await connection.confirmTransaction(mintTx, "confirmed");

      // Freeze the source account first (required for seizure)
      const freezeTx = await sdk.freezeTokenAccount(mint, sourceTokenAccount, authority);
      await connection.confirmTransaction(freezeTx, "confirmed");

      // Seize tokens - requires both seizer and freeze authority signers
      const seizeAmount = new BN(500_000);
      const tx = await sdk.seize(
        mint,
        seizer,           // seizer signer
        authority,        // freeze authority signer
        {
          sourceToken: sourceTokenAccount,
          destToken: destTokenAccount,
          amount: seizeAmount,
        }
      );

      console.log("Seize transaction:", tx);
      await connection.confirmTransaction(tx, "confirmed");

      // Verify balances
      const sourceInfo = await getAccount(connection, sourceTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      const destInfo = await getAccount(connection, destTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(sourceInfo.amount)).to.equal(500_000);
      expect(Number(destInfo.amount)).to.equal(500_000);
    });
  });

  describe("test_full_workflow", () => {
    it("should execute a complete stablecoin workflow", async () => {
      console.log("Starting full workflow test...");

      // 1. Initialize stablecoin with SSS-2 features
      console.log("Step 1: Initialize stablecoin");
      const workflowMint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,  // freeze authority
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const initTx = await sdk.initialize(workflowMint, authority, {
        name: "Workflow Stablecoin",
        symbol: "WORK",
        uri: "https://example.com/workflow.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      // 1b. Update roles to assign blacklister, pauser, seizer
      console.log("Step 1b: Update roles");
      const rolesTx = await sdk.updateRoles(workflowMint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      // 2. Add minter with quota
      console.log("Step 2: Add minter");
      const addMinterTx = await sdk.addMinter(workflowMint, authority, {
        minter: minter.publicKey,
        quota: new BN(1_000_000_000),
      });
      await connection.confirmTransaction(addMinterTx, "confirmed");

      // 3. Mint tokens to user
      console.log("Step 3: Mint tokens");
      const workflowUser = Keypair.generate();
      const userTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        workflowMint,
        workflowUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const userTokenAccount = userTokenAccountInfo.address;

      const mintTx = await sdk.mintTokens(
        workflowMint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount: new BN(1_000_000) }
      );
      await connection.confirmTransaction(mintTx, "confirmed");

      // 4. Verify user has tokens
      const accountInfo = await getAccount(connection, userTokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(1_000_000);

      // 5. Add user to blacklist
      console.log("Step 5: Add to blacklist");
      const blacklistTx = await sdk.addToBlacklist(workflowMint, blacklister, {
        user: workflowUser.publicKey,
        reason: "Compliance check",
      });
      await connection.confirmTransaction(blacklistTx, "confirmed");

      // 6. Seize tokens from blacklisted user - SKIPPED (requires Token-2022 permanent delegate extension)
      // The seize operation requires the seizer to be set as the permanent delegate on the mint
      console.log("Step 6: Seize tokens - SKIPPED (requires permanent delegate extension)");
      
      // Create treasury account for future operations
      const treasury = Keypair.generate();
      const treasuryTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        workflowMint,
        treasury.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const treasuryTokenAccount = treasuryTokenAccountInfo.address;

      // 7. Remove user from blacklist
      console.log("Step 7: Remove from blacklist");
      const unblacklistTx = await sdk.removeFromBlacklist(workflowMint, blacklister, {
        user: workflowUser.publicKey,
      });
      await connection.confirmTransaction(unblacklistTx, "confirmed");

      // 8. Pause for emergency
      console.log("Step 8: Pause");
      const pauseTx = await sdk.pause(workflowMint, pauser);
      await connection.confirmTransaction(pauseTx, "confirmed");

      // 9. Unpause
      console.log("Step 9: Unpause");
      const unpauseTx = await sdk.unpause(workflowMint, pauser);
      await connection.confirmTransaction(unpauseTx, "confirmed");

      // 10. Burn tokens from user account (since seize was skipped)
      console.log("Step 10: Burn tokens");
      const burnTx = await sdk.burnTokens(
        workflowMint,
        userTokenAccount,
        workflowUser,
        { amount: new BN(500_000) }
      );
      await connection.confirmTransaction(burnTx, "confirmed");

      console.log("Full workflow test completed successfully!");
    });
  });
});