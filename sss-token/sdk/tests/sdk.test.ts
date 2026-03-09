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
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  SSSTokenClient,
  SSS_TOKEN_PROGRAM_ID,
  findConfigPDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
} from "../src/index";

describe("SSS Token SDK Tests", function () {
  this.timeout(100000);

  // Setup test environment
  const provider = AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as Wallet;
  
  // Test keypairs
  const payer = wallet.payer || Keypair.generate();
  const authority = payer;
  const minter = Keypair.generate();
  const user = Keypair.generate();
  const seizer = Keypair.generate();
  const blacklister = Keypair.generate();
  const pauser = Keypair.generate();

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

    // Create token mint
    console.log("Creating token mint...");
    mint = await createMint(
      connection,
      payer,
      authority.publicKey,
      null,
      6
    );
    console.log("Mint created:", mint.toString());
  });

  describe("test_initialize_sss1_minimal_stablecoin", () => {
    it("should initialize a new stablecoin with minimal configuration", async () => {
      const configPDA = findConfigPDA(mint);
      console.log("Config PDA:", configPDA.pda.toString());

      const tx = await sdk.initialize(mint, authority, {
        name: "Test Stablecoin",
        symbol: "TST",
        uri: "https://example.com/metadata.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });

      console.log("Initialize transaction:", tx);

      // Verify config exists
      const config = await sdk.getConfig(mint);
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
      await sdk.addMinter(mint, authority, {
        minter: minter2.publicKey,
        quota: new BN(100_000_000),
      });

      // Remove minter
      const tx = await sdk.removeMinter(mint, authority, {
        minter: minter2.publicKey,
      });

      console.log("Remove minter transaction:", tx);

      // Verify quota is set to 0
      const minterInfo = await sdk.getMinterInfo(mint, minter2.publicKey);
      expect(minterInfo.quota.toString()).to.equal("0");
    });
  });

  describe("test_pause_and_unpause", () => {
    it("should pause all token operations", async () => {
      const tx = await sdk.pause(mint, authority);
      console.log("Pause transaction:", tx);

      const config = await sdk.getConfig(mint);
      expect(config.paused).to.be.true;
    });

    it("should unpause all token operations", async () => {
      const tx = await sdk.unpause(mint, authority);
      console.log("Unpause transaction:", tx);

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

      const config = await sdk.getConfig(mint);
      expect(config.masterAuthority.toString()).to.equal(newAuthority.publicKey.toString());

      // Transfer back to original authority
      await sdk.transferAuthority(mint, newAuthority, {
        newMasterAuthority: authority.publicKey,
      });
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

      const config = await sdk.getConfig(mint);
      expect(config.blacklister.toString()).to.equal(blacklister.publicKey.toString());
      expect(config.pauser.toString()).to.equal(pauser.publicKey.toString());
      expect(config.seizer.toString()).to.equal(seizer.publicKey.toString());
    });
  });

  describe("test_mint_tokens", () => {
    it("should mint tokens to a recipient account", async () => {
      // Create token account for user
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey
      );

      const amount = new BN(1_000_000); // 1 token

      const tx = await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount }
      );

      console.log("Mint tokens transaction:", tx);

      // Verify balance
      const accountInfo = await getAccount(connection, userTokenAccount);
      expect(Number(accountInfo.amount)).to.equal(amount.toNumber());

      // Verify minter's minted amount
      const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
      expect(minterInfo.minted.toString()).to.equal(amount.toString());
    });

    it("should enforce quota limits", async () => {
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey
      );

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
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey
      );

      // First, mint some tokens
      await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount: new BN(1_000_000) }
      );

      const burnAmount = new BN(500_000);
      const tx = await sdk.burnTokens(
        mint,
        userTokenAccount,
        user,
        { amount: burnAmount }
      );

      console.log("Burn tokens transaction:", tx);

      // Verify balance
      const accountInfo = await getAccount(connection, userTokenAccount);
      expect(Number(accountInfo.amount)).to.equal(500_000);
    });
  });

  describe("test_freeze_and_thaw_token_account", () => {
    it("should freeze a token account", async () => {
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey
      );

      const tx = await sdk.freezeTokenAccount(
        mint,
        userTokenAccount,
        authority
      );

      console.log("Freeze transaction:", tx);

      // Verify account is frozen
      const accountInfo = await getAccount(connection, userTokenAccount);
      expect(accountInfo.isFrozen).to.be.true;
    });

    it("should thaw (unfreeze) a token account", async () => {
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        user.publicKey
      );

      const tx = await sdk.thawTokenAccount(
        mint,
        userTokenAccount,
        authority
      );

      console.log("Thaw transaction:", tx);

      // Verify account is not frozen
      const accountInfo = await getAccount(connection, userTokenAccount);
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
      await sdk.addToBlacklist(mint, blacklister, {
        user: maliciousUser.publicKey,
        reason: "Test reason",
      });

      const tx = await sdk.removeFromBlacklist(mint, blacklister, {
        user: maliciousUser.publicKey,
      });

      console.log("Remove from blacklist transaction:", tx);

      // Verify blacklist entry no longer exists
      const isBlacklisted = await sdk.isBlacklisted(mint, maliciousUser.publicKey);
      expect(isBlacklisted).to.be.false;
    });
  });

  describe("test_seize_tokens", () => {
    it("should seize tokens from an account", async () => {
      const sourceUser = Keypair.generate();
      const destUser = Keypair.generate();

      // Create token accounts
      const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        sourceUser.publicKey
      );
      const destTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        destUser.publicKey
      );

      // Mint tokens to source
      await sdk.mintTokens(
        mint,
        authority,
        minter.publicKey,
        sourceTokenAccount,
        { amount: new BN(1_000_000) }
      );

      // Seize tokens
      const seizeAmount = new BN(500_000);
      const tx = await sdk.seize(mint, seizer, {
        sourceToken: sourceTokenAccount,
        destToken: destTokenAccount,
        amount: seizeAmount,
      });

      console.log("Seize transaction:", tx);

      // Verify balances
      const sourceInfo = await getAccount(connection, sourceTokenAccount);
      const destInfo = await getAccount(connection, destTokenAccount);
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
        seizer.publicKey,
        6
      );

      await sdk.initialize(workflowMint, authority, {
        name: "Workflow Stablecoin",
        symbol: "WORK",
        uri: "https://example.com/workflow.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });

      // 2. Add minter with quota
      console.log("Step 2: Add minter");
      await sdk.addMinter(workflowMint, authority, {
        minter: minter.publicKey,
        quota: new BN(1_000_000_000),
      });

      // 3. Mint tokens to user
      console.log("Step 3: Mint tokens");
      const workflowUser = Keypair.generate();
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        workflowMint,
        workflowUser.publicKey
      );

      await sdk.mintTokens(
        workflowMint,
        authority,
        minter.publicKey,
        userTokenAccount,
        { amount: new BN(1_000_000) }
      );

      // 4. Verify user has tokens
      const accountInfo = await getAccount(connection, userTokenAccount);
      expect(Number(accountInfo.amount)).to.equal(1_000_000);

      // 5. Add user to blacklist
      console.log("Step 5: Add to blacklist");
      await sdk.addToBlacklist(workflowMint, blacklister, {
        user: workflowUser.publicKey,
        reason: "Compliance check",
      });

      // 6. Seize tokens from blacklisted user
      console.log("Step 6: Seize tokens");
      const treasury = Keypair.generate();
      const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        workflowMint,
        treasury.publicKey
      );

      await sdk.seize(workflowMint, seizer, {
        sourceToken: userTokenAccount,
        destToken: treasuryTokenAccount,
        amount: new BN(1_000_000),
      });

      // 7. Remove user from blacklist
      console.log("Step 7: Remove from blacklist");
      await sdk.removeFromBlacklist(workflowMint, blacklister, {
        user: workflowUser.publicKey,
      });

      // 8. Pause for emergency
      console.log("Step 8: Pause");
      await sdk.pause(workflowMint, pauser);

      // 9. Unpause
      console.log("Step 9: Unpause");
      await sdk.unpause(workflowMint, pauser);

      // 10. Burn excess tokens
      console.log("Step 10: Burn tokens");
      await sdk.burnTokens(
        workflowMint,
        treasuryTokenAccount,
        treasury,
        { amount: new BN(500_000) }
      );

      console.log("Full workflow test completed successfully!");
    });
  });
});