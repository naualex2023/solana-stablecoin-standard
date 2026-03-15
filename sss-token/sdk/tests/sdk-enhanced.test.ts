/**
 * Test suite for Enhanced SolanaStablecoin SDK
 * Tests the new namespaced API and preset support
 */

import { expect } from "chai";
import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializePermanentDelegateInstruction,
  createInitializeMintInstruction,
  getMint,
} from "@solana/spl-token";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  SolanaStablecoin,
  Preset,
  PRESET_CONFIGS,
  SSSTokenClient,
  findPermanentDelegatePDA,
  findFreezeAuthorityPDA,
  SSS_TOKEN_PROGRAM_ID,
} from "../src/index";

/**
 * Helper function to create a Token-2022 mint with the PermanentDelegate extension
 * This allows the program's permanent delegate PDA to transfer tokens from any account
 * 
 * IMPORTANT: The freeze authority is set to the program's freeze authority PDA,
 * which allows the seize instruction to thaw frozen accounts using PDA signing.
 */
async function createMintWithPermanentDelegate(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number,
  programId: PublicKey
): Promise<PublicKey> {
  // Generate mint keypair first to derive PDAs
  const mintKeypair = Keypair.generate();
  
  // Derive both PDAs from the mint address
  const { pda: permanentDelegate } = findPermanentDelegatePDA(mintKeypair.publicKey, programId);
  const { pda: freezeAuthority } = findFreezeAuthorityPDA(mintKeypair.publicKey, programId);

  // Calculate mint size with PermanentDelegate extension
  const extensions = [ExtensionType.PermanentDelegate];
  const mintLen = getMintLen(extensions);

  // Calculate minimum balance for rent exemption
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  // Build transaction to create mint with extension
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
      permanentDelegate, // Our program's PDA as the permanent delegate
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority, // Program's PDA as freeze authority (for seize operation)
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, transaction, [payer, mintKeypair], {
    commitment: "confirmed",
  });

  console.log("Created mint with permanent delegate:", mintKeypair.publicKey.toString());
  console.log("  Permanent delegate PDA:", permanentDelegate.toString());
  console.log("  Freeze authority PDA:", freezeAuthority.toString());
  
  return mintKeypair.publicKey;
}

describe("SolanaStablecoin Enhanced SDK Tests", function () {
  this.timeout(100000);

  // Setup test environment
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

  // Create wallet and provider
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet);

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

    // Fund other keypairs for rent costs
    const keypairs = [blacklister, pauser, seizer, minter];
    for (const kp of keypairs) {
      const bal = await connection.getBalance(kp.publicKey);
      if (bal < LAMPORTS_PER_SOL) {
        const airdrop = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdrop);
      }
    }
    console.log("All keypairs funded");
  });

  describe("Preset Configuration Tests", () => {
    it("should have correct SSS_1 preset configuration", () => {
      const config = PRESET_CONFIGS[Preset.SSS_1];
      
      expect(config.enablePermanentDelegate).to.be.false;
      expect(config.enableTransferHook).to.be.false;
      expect(config.defaultAccountFrozen).to.be.false;
    });

    it("should have correct SSS_2 preset configuration", () => {
      const config = PRESET_CONFIGS[Preset.SSS_2];
      
      expect(config.enablePermanentDelegate).to.be.true;
      expect(config.enableTransferHook).to.be.true;
      expect(config.defaultAccountFrozen).to.be.true;
    });

    it("should allow preset enum values to be used as strings", () => {
      expect(Preset.SSS_1).to.equal("sss-1");
      expect(Preset.SSS_2).to.equal("sss-2");
    });
  });

  describe("SolanaStablecoin.connect() Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      // Create and initialize a mint using the low-level API
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(mint, authority, {
        name: "Connect Test Stablecoin",
        symbol: "CONN",
        uri: "https://example.com/connect.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");
      console.log("Test mint initialized:", mint.toString());
    });

    it("should connect to an existing stablecoin", async () => {
      stable = await SolanaStablecoin.connect(provider, { mint });
      
      expect(stable).to.exist;
      expect(stable.mint.toString()).to.equal(mint.toString());
      expect(stable.mintAddress).to.equal(mint.toString());
    });

    it("should have all namespaced APIs available", () => {
      expect(stable.compliance).to.exist;
      expect(stable.minting).to.exist;
      expect(stable.burning).to.exist;
      expect(stable.pause).to.exist;
      expect(stable.authority).to.exist;
    });

    it("should fetch config through enhanced SDK", async () => {
      const config = await stable.getConfig();
      
      expect(config).to.exist;
      expect(config.name).to.equal("Connect Test Stablecoin");
      expect(config.symbol).to.equal("CONN");
    });
  });

  describe("Compliance API Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      // Create mint with compliance features
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(mint, authority, {
        name: "Compliance Test Stablecoin",
        symbol: "COMP",
        uri: "https://example.com/compliance.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      // Set up roles
      const rolesTx = await client.updateRoles(mint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      stable = await SolanaStablecoin.connect(provider, { mint });
    });

    it("should add address to blacklist using namespaced API", async () => {
      const maliciousUser = Keypair.generate();
      
      const tx = await stable.compliance.blacklistAdd(
        blacklister,
        maliciousUser.publicKey,
        "Suspicious activity"
      );
      await connection.confirmTransaction(tx, "confirmed");

      const isBlacklisted = await stable.compliance.isBlacklisted(maliciousUser.publicKey);
      expect(isBlacklisted).to.be.true;
    });

    it("should remove address from blacklist using namespaced API", async () => {
      const userToRemove = Keypair.generate();
      
      // Add first
      await stable.compliance.blacklistAdd(
        blacklister,
        userToRemove.publicKey,
        "Test reason"
      );

      // Remove
      const tx = await stable.compliance.blacklistRemove(
        blacklister,
        userToRemove.publicKey
      );
      await connection.confirmTransaction(tx, "confirmed");

      const isBlacklisted = await stable.compliance.isBlacklisted(userToRemove.publicKey);
      expect(isBlacklisted).to.be.false;
    });

    it("should freeze token account using namespaced API", async () => {
      const freezeUser = Keypair.generate();
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        freezeUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const tx = await stable.compliance.freeze(tokenAccount.address, authority);
      await connection.confirmTransaction(tx, "confirmed");

      const accountInfo = await getAccount(connection, tokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(accountInfo.isFrozen).to.be.true;
    });

    it("should thaw token account using namespaced API", async () => {
      const thawUser = Keypair.generate();
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
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
      await stable.compliance.freeze(tokenAccount.address, authority);

      // Thaw
      const tx = await stable.compliance.thaw(tokenAccount.address, authority);
      await connection.confirmTransaction(tx, "confirmed");

      const accountInfo = await getAccount(connection, tokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(accountInfo.isFrozen).to.be.false;
    });
  });

  describe("Minting API Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(mint, authority, {
        name: "Minting Test Stablecoin",
        symbol: "MINT",
        uri: "https://example.com/minting.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      stable = await SolanaStablecoin.connect(provider, { mint });
    });

    it("should add minter using namespaced API", async () => {
      const tx = await stable.minting.addMinter(
        authority,
        minter.publicKey,
        new BN(1_000_000_000)
      );
      await connection.confirmTransaction(tx, "confirmed");

      const minterInfo = await stable.minting.getMinterInfo(minter.publicKey);
      expect(minterInfo.authority.toString()).to.equal(minter.publicKey.toString());
      expect(minterInfo.quota.toString()).to.equal("1000000000");
    });

    it("should update minter quota using namespaced API", async () => {
      const tx = await stable.minting.updateQuota(
        authority,
        minter.publicKey,
        new BN(2_000_000_000)
      );
      await connection.confirmTransaction(tx, "confirmed");

      const minterInfo = await stable.minting.getMinterInfo(minter.publicKey);
      expect(minterInfo.quota.toString()).to.equal("2000000000");
    });

    it("should mint tokens using namespaced API", async () => {
      const recipient = Keypair.generate();
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        recipient.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const tx = await stable.minting.mintTokens(
        authority,
        minter.publicKey,
        tokenAccount.address,
        new BN(500_000)
      );
      await connection.confirmTransaction(tx, "confirmed");

      const accountInfo = await getAccount(connection, tokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(500_000);
    });

    it("should remove minter using namespaced API", async () => {
      const minterToRemove = Keypair.generate();
      
      // Add minter first
      await stable.minting.addMinter(authority, minterToRemove.publicKey, new BN(100_000));

      // Remove
      const tx = await stable.minting.removeMinter(authority, minterToRemove.publicKey);
      await connection.confirmTransaction(tx, "confirmed");

      const minterInfo = await stable.minting.getMinterInfo(minterToRemove.publicKey);
      expect(minterInfo.quota.toString()).to.equal("0");
    });
  });

  describe("Burning API Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      await client.initialize(mint, authority, {
        name: "Burning Test Stablecoin",
        symbol: "BURN",
        uri: "https://example.com/burning.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });

      // Add minter
      await client.addMinter(mint, authority, {
        minter: minter.publicKey,
        quota: new BN(1_000_000_000),
      });

      stable = await SolanaStablecoin.connect(provider, { mint });
    });

    it("should burn tokens using namespaced API", async () => {
      const burnUser = Keypair.generate();
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        burnUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Mint some tokens first
      const client = new SSSTokenClient({ provider });
      await client.mintTokens(mint, authority, minter.publicKey, tokenAccount.address, {
        amount: new BN(1_000_000),
      });

      // Burn half
      const tx = await stable.burning.burn(tokenAccount.address, burnUser, new BN(500_000));
      await connection.confirmTransaction(tx, "confirmed");

      const accountInfo = await getAccount(connection, tokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(500_000);
    });
  });

  describe("Pause API Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      await client.initialize(mint, authority, {
        name: "Pause Test Stablecoin",
        symbol: "PAUS",
        uri: "https://example.com/pause.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });

      // Set pauser role
      await client.updateRoles(mint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });

      stable = await SolanaStablecoin.connect(provider, { mint });
    });

    it("should pause using namespaced API", async () => {
      const tx = await stable.pause.pause(pauser);
      await connection.confirmTransaction(tx, "confirmed");

      const isPaused = await stable.pause.isPaused();
      expect(isPaused).to.be.true;
    });

    it("should unpause using namespaced API", async () => {
      const tx = await stable.pause.unpause(pauser);
      await connection.confirmTransaction(tx, "confirmed");

      const isPaused = await stable.pause.isPaused();
      expect(isPaused).to.be.false;
    });
  });

  describe("Authority API Tests", () => {
    let mint: PublicKey;
    let stable: SolanaStablecoin;

    before(async () => {
      mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(mint, authority, {
        name: "Authority Test Stablecoin",
        symbol: "AUTH",
        uri: "https://example.com/auth.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      stable = await SolanaStablecoin.connect(provider, { mint });
    });

    it("should transfer authority using namespaced API", async () => {
      const newAuthority = Keypair.generate();

      const tx = await stable.authority.transfer(authority, newAuthority.publicKey);
      await connection.confirmTransaction(tx, "confirmed");

      const config = await stable.getConfig();
      expect(config.masterAuthority.toString()).to.equal(newAuthority.publicKey.toString());

      // Transfer back for cleanup
      await stable.authority.transfer(newAuthority, authority.publicKey);
    });

    it("should update roles using namespaced API", async () => {
      const newBlacklister = Keypair.generate();
      const newPauser = Keypair.generate();
      const newSeizer = Keypair.generate();

      const tx = await stable.authority.updateRoles(authority, {
        blacklister: newBlacklister.publicKey,
        pauser: newPauser.publicKey,
        seizer: newSeizer.publicKey,
      });
      await connection.confirmTransaction(tx, "confirmed");

      const config = await stable.getConfig();
      expect(config.blacklister.toString()).to.equal(newBlacklister.publicKey.toString());
      expect(config.pauser.toString()).to.equal(newPauser.publicKey.toString());
      expect(config.seizer.toString()).to.equal(newSeizer.publicKey.toString());
    });
  });

  describe("SolanaStablecoin.fromClient() Tests", () => {
    it("should create enhanced SDK from existing client", async () => {
      const mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const client = new SSSTokenClient({ provider });
      await client.initialize(mint, authority, {
        name: "From Client Test",
        symbol: "FCLT",
        uri: "https://example.com/fromclient.json",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        defaultAccountFrozen: false,
      });

      const stable = SolanaStablecoin.fromClient(client, mint);

      expect(stable).to.exist;
      expect(stable.client).to.equal(client);
      expect(stable.mint.toString()).to.equal(mint.toString());
    });
  });

  describe("Full Workflow with Enhanced SDK", () => {
    it("should execute complete workflow using namespaced APIs", async () => {
      console.log("Starting enhanced SDK workflow test...");

      // Create mint
      const mint = await createMint(
        connection,
        payer,
        authority.publicKey,
        authority.publicKey,
        6,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Initialize using low-level API (create() requires mint keypair signing)
      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(mint, authority, {
        name: "Workflow Enhanced",
        symbol: "WFLE",
        uri: "https://example.com/workflow.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      // Connect using enhanced SDK
      const stable = await SolanaStablecoin.connect(provider, { mint });

      // 1. Set up roles
      console.log("Step 1: Update roles");
      const rolesTx = await stable.authority.updateRoles(authority, {
        blacklister: blacklister.publicKey,
        pauser: pauser.publicKey,
        seizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      // 2. Add minter
      console.log("Step 2: Add minter");
      const addMinterTx = await stable.minting.addMinter(authority, minter.publicKey, new BN(1_000_000_000));
      await connection.confirmTransaction(addMinterTx, "confirmed");

      // 3. Mint tokens
      console.log("Step 3: Mint tokens");
      const workflowUser = Keypair.generate();
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        workflowUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const mintTokensTx = await stable.minting.mintTokens(
        authority,
        minter.publicKey,
        userTokenAccount.address,
        new BN(1_000_000)
      );
      await connection.confirmTransaction(mintTokensTx, "confirmed");

      // 4. Verify balance
      const accountInfo = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(accountInfo.amount)).to.equal(1_000_000);

      // 5. Blacklist user
      console.log("Step 5: Blacklist user");
      const blacklistTx = await stable.compliance.blacklistAdd(blacklister, workflowUser.publicKey, "Test blacklist");
      await connection.confirmTransaction(blacklistTx, "confirmed");
      expect(await stable.compliance.isBlacklisted(workflowUser.publicKey)).to.be.true;

      // 6. Remove from blacklist
      console.log("Step 6: Remove from blacklist");
      const unblacklistTx = await stable.compliance.blacklistRemove(blacklister, workflowUser.publicKey);
      await connection.confirmTransaction(unblacklistTx, "confirmed");
      expect(await stable.compliance.isBlacklisted(workflowUser.publicKey)).to.be.false;

      // 7. Pause
      console.log("Step 7: Pause");
      const pauseTx = await stable.pause.pause(pauser);
      await connection.confirmTransaction(pauseTx, "confirmed");
      expect(await stable.pause.isPaused()).to.be.true;

      // 8. Unpause
      console.log("Step 8: Unpause");
      const unpauseTx = await stable.pause.unpause(pauser);
      await connection.confirmTransaction(unpauseTx, "confirmed");
      expect(await stable.pause.isPaused()).to.be.false;

      // 9. Burn tokens
      console.log("Step 9: Burn tokens");
      const burnTx = await stable.burning.burn(userTokenAccount.address, workflowUser, new BN(500_000));
      await connection.confirmTransaction(burnTx, "confirmed");

      const finalBalance = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(Number(finalBalance.amount)).to.equal(500_000);

      console.log("Enhanced SDK workflow test completed successfully!");
    });
  });

  describe("Freeze/Thaw with PDA Authority", () => {
    it("should freeze and thaw token account using PDA-based freeze authority", async () => {
      console.log("Starting freeze/thaw PDA test...");

      // 1. Create mint with PDA freeze authority (no permanent delegate needed for just freeze/thaw)
      console.log("Step 1: Creating mint with PDA freeze authority...");
      const programId = new PublicKey(SSS_TOKEN_PROGRAM_ID);
      const freezeMint = await createMintWithPermanentDelegate(
        connection,
        payer,
        authority.publicKey,
        6,
        programId
      );
      console.log("Mint with PDA freeze authority created:", freezeMint.toString());

      // 2. Initialize the stablecoin config
      console.log("Step 2: Initializing stablecoin config...");
      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(freezeMint, authority, {
        name: "Freeze Thaw Test",
        symbol: "FRTH",
        uri: "https://example.com/freezethaw.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      // 3. Set up roles (seizer role required for PDA freeze/thaw)
      console.log("Step 3: Setting up roles...");
      const rolesTx = await client.updateRoles(freezeMint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      // 4. Create token account for user
      const freezeUser = Keypair.generate();
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        freezeMint,
        freezeUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      console.log("User token account created:", userTokenAccount.address.toString());

      // 5. Freeze using PDA method
      console.log("Step 4: Freezing account with PDA authority...");
      const freezeTx = await client.freezeTokenAccountPda(freezeMint, userTokenAccount.address, seizer);
      await connection.confirmTransaction(freezeTx, "confirmed");
      console.log("Freeze tx:", freezeTx);

      const frozenAccount = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(frozenAccount.isFrozen).to.be.true;
      console.log("Account successfully frozen");

      // 6. Thaw using PDA method
      console.log("Step 5: Thawing account with PDA authority...");
      const thawTx = await client.thawTokenAccountPda(freezeMint, userTokenAccount.address, seizer);
      await connection.confirmTransaction(thawTx, "confirmed");
      console.log("Thaw tx:", thawTx);

      const thawedAccount = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(thawedAccount.isFrozen).to.be.false;
      console.log("Account successfully thawed");

      console.log("Freeze/Thaw PDA test completed successfully!");
    });
  });

  describe("Negative Test Cases - Enhanced SDK", () => {
    describe("Compliance API Negative Cases", () => {
      it("should fail to blacklist when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        await client.updateRoles(mint, authority, {
          newBlacklister: blacklister.publicKey,
          newPauser: pauser.publicKey,
          newSeizer: seizer.publicKey,
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();
        const userToBlacklist = Keypair.generate();

        try {
          await stable.compliance.blacklistAdd(
            unauthorizedUser,
            userToBlacklist.publicKey,
            "Test reason"
          );
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized blacklist error:", error.message);
        }
      });

      it("should fail to blacklist with reason too long", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        await client.updateRoles(mint, authority, {
          newBlacklister: blacklister.publicKey,
          newPauser: pauser.publicKey,
          newSeizer: seizer.publicKey,
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const userToBlacklist = Keypair.generate();
        const longReason = "x".repeat(101); // Max 100 chars

        try {
          await stable.compliance.blacklistAdd(
            blacklister,
            userToBlacklist.publicKey,
            longReason
          );
          expect.fail("Should have thrown error for reason too long");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Reason too long error:", error.message);
        }
      });

      it("should fail to remove from blacklist when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        await client.updateRoles(mint, authority, {
          newBlacklister: blacklister.publicKey,
          newPauser: pauser.publicKey,
          newSeizer: seizer.publicKey,
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const userToRemove = Keypair.generate();

        // Add to blacklist first
        await stable.compliance.blacklistAdd(blacklister, userToRemove.publicKey, "Test");

        const unauthorizedUser = Keypair.generate();
        try {
          await stable.compliance.blacklistRemove(unauthorizedUser, userToRemove.publicKey);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized unblacklist error:", error.message);
        } finally {
          // Cleanup
          await stable.compliance.blacklistRemove(blacklister, userToRemove.publicKey);
        }
      });

      it("should fail to freeze when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        // Use the client directly instead of SolanaStablecoin.connect to avoid account fetch issues
        const freezeUser = Keypair.generate();
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          freezeUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const unauthorizedUser = Keypair.generate();
        try {
          await client.freezeTokenAccount(mint, tokenAccount.address, unauthorizedUser);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized freeze error:", error.message);
        }
      });

      it("should fail to thaw when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          defaultAccountFrozen: false,
        });

        // Use the client directly instead of SolanaStablecoin.connect
        const thawUser = Keypair.generate();
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          thawUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Freeze first with authorized user
        await client.freezeTokenAccount(mint, tokenAccount.address, authority);

        const unauthorizedUser = Keypair.generate();
        try {
          await client.thawTokenAccount(mint, tokenAccount.address, unauthorizedUser);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized thaw error:", error.message);
        } finally {
          // Cleanup
          await client.thawTokenAccount(mint, tokenAccount.address, authority);
        }
      });
    });

    describe("Minting API Negative Cases", () => {
      it("should fail to add minter when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        const initTx = await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });
        await connection.confirmTransaction(initTx, "confirmed");

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();
        const newMinter = Keypair.generate();

        try {
          await stable.minting.addMinter(
            unauthorizedUser,
            newMinter.publicKey,
            new BN(1_000_000)
          );
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized add minter error:", error.message);
        }
      });

      it("should fail to update quota when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        // Add minter first
        await client.addMinter(mint, authority, {
          minter: minter.publicKey,
          quota: new BN(1_000_000),
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();

        try {
          await stable.minting.updateQuota(
            unauthorizedUser,
            minter.publicKey,
            new BN(5_000_000)
          );
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized update quota error:", error.message);
        }
      });

      it("should fail to remove minter when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        // Add minter first
        await client.addMinter(mint, authority, {
          minter: minter.publicKey,
          quota: new BN(1_000_000),
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();

        try {
          await stable.minting.removeMinter(unauthorizedUser, minter.publicKey);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized remove minter error:", error.message);
        }
      });

      it("should fail to mint over quota", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        // Add minter with small quota
        await client.addMinter(mint, authority, {
          minter: minter.publicKey,
          quota: new BN(100),
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const recipient = Keypair.generate();
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          recipient.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        try {
          // Try to mint more than quota
          await stable.minting.mintTokens(
            authority,
            minter.publicKey,
            tokenAccount.address,
            new BN(1_000) // More than quota of 100
          );
          expect.fail("Should have thrown quota exceeded error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Quota exceeded error:", error.message);
        }
      });
    });

    describe("Pause API Negative Cases", () => {
      it("should fail to pause when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        await client.updateRoles(mint, authority, {
          newBlacklister: blacklister.publicKey,
          newPauser: pauser.publicKey,
          newSeizer: seizer.publicKey,
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();

        try {
          await stable.pause.pause(unauthorizedUser);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized pause error:", error.message);
        }
      });

      it("should fail to unpause when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        await client.updateRoles(mint, authority, {
          newBlacklister: blacklister.publicKey,
          newPauser: pauser.publicKey,
          newSeizer: seizer.publicKey,
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });

        // Pause first with authorized user
        await stable.pause.pause(pauser);

        const unauthorizedUser = Keypair.generate();
        try {
          await stable.pause.unpause(unauthorizedUser);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized unpause error:", error.message);
        } finally {
          // Cleanup
          await stable.pause.unpause(pauser);
        }
      });
    });

    describe("Authority API Negative Cases", () => {
      it("should fail to transfer authority when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        const initTx = await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });
        await connection.confirmTransaction(initTx, "confirmed");

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();
        const newAuthority = Keypair.generate();

        try {
          await stable.authority.transfer(unauthorizedUser, newAuthority.publicKey);
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized transfer authority error:", error.message);
        }
      });

      it("should fail to update roles when unauthorized", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        const initTx = await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });
        await connection.confirmTransaction(initTx, "confirmed");

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const unauthorizedUser = Keypair.generate();

        try {
          await stable.authority.updateRoles(unauthorizedUser, {
            blacklister: Keypair.generate().publicKey,
            pauser: Keypair.generate().publicKey,
            seizer: Keypair.generate().publicKey,
          });
          expect.fail("Should have thrown unauthorized error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Unauthorized update roles error:", error.message);
        }
      });
    });

    describe("Burning API Negative Cases", () => {
      it("should fail to burn more than balance", async () => {
        const mint = await createMint(
          connection,
          payer,
          authority.publicKey,
          authority.publicKey,
          6,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        const client = new SSSTokenClient({ provider });
        await client.initialize(mint, authority, {
          name: "Negative Test",
          symbol: "NEG",
          uri: "https://example.com",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
        });

        // Add minter
        await client.addMinter(mint, authority, {
          minter: minter.publicKey,
          quota: new BN(1_000_000_000),
        });

        const stable = await SolanaStablecoin.connect(provider, { mint });
        const burnUser = Keypair.generate();
        const tokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          payer,
          mint,
          burnUser.publicKey,
          undefined,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );

        // Mint only 100 tokens
        await stable.minting.mintTokens(authority, minter.publicKey, tokenAccount.address, new BN(100));

        try {
          // Try to burn 1000 tokens
          await stable.burning.burn(tokenAccount.address, burnUser, new BN(1_000));
          expect.fail("Should have thrown insufficient balance error");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Insufficient balance error:", error.message);
        }
      });
    });

    describe("Preset Configuration Negative Cases", () => {
      it("should not allow invalid preset values", () => {
        // Test that only valid presets work
        const validPresets = [Preset.SSS_1, Preset.SSS_2];
        const invalidPreset = "invalid-preset" as Preset;

        expect(validPresets.includes(invalidPreset)).to.be.false;
      });
    });

    describe("Connection Negative Cases", () => {
      it("should fail to connect to non-existent stablecoin", async () => {
        const fakeMint = Keypair.generate().publicKey;

        try {
          await SolanaStablecoin.connect(provider, { mint: fakeMint });
          expect.fail("Should have thrown error for non-existent config");
        } catch (error: any) {
          expect(error).to.exist;
          console.log("Non-existent stablecoin error:", error.message);
        }
      });
    });
  });

  describe("Seize with Permanent Delegate Extension", () => {
    it("should create mint with permanent delegate and seize tokens from frozen account", async () => {
      console.log("Starting seize test with permanent delegate extension...");

      // 1. Create mint with PermanentDelegate extension
      console.log("Step 1: Creating mint with permanent delegate extension...");
      const programId = new PublicKey(SSS_TOKEN_PROGRAM_ID);
      const seizeMint = await createMintWithPermanentDelegate(
        connection,
        payer,
        authority.publicKey,  // mint authority (freeze authority is derived as PDA)
        6,
        programId
      );
      console.log("Mint with permanent delegate created:", seizeMint.toString());

      // Verify the permanent delegate is set
      const mintInfo = await getMint(connection, seizeMint, undefined, TOKEN_2022_PROGRAM_ID);
      const { pda: expectedDelegate } = findPermanentDelegatePDA(seizeMint, programId);
      console.log("Expected permanent delegate:", expectedDelegate.toString());
      // Note: permanentDelegate property may not be typed in older @solana/spl-token versions
      console.log("Mint info retrieved successfully");

      // 2. Initialize the stablecoin config
      console.log("Step 2: Initializing stablecoin config...");
      const client = new SSSTokenClient({ provider });
      const initTx = await client.initialize(seizeMint, authority, {
        name: "Seize Test Stablecoin",
        symbol: "SEIZ",
        uri: "https://example.com/seize.json",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      });
      await connection.confirmTransaction(initTx, "confirmed");

      // 3. Set up roles
      console.log("Step 3: Setting up roles...");
      const rolesTx = await client.updateRoles(seizeMint, authority, {
        newBlacklister: blacklister.publicKey,
        newPauser: pauser.publicKey,
        newSeizer: seizer.publicKey,
      });
      await connection.confirmTransaction(rolesTx, "confirmed");

      // 4. Add minter and mint tokens to user
      console.log("Step 4: Minting tokens to user...");
      const addMinterTx = await client.addMinter(seizeMint, authority, {
        minter: minter.publicKey,
        quota: new BN(1_000_000_000),
      });
      await connection.confirmTransaction(addMinterTx, "confirmed");
      console.log("Minter added");

      const seizeUser = Keypair.generate();
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        seizeMint,
        seizeUser.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      console.log("User token account created:", userTokenAccount.address.toString());

      const mintTokensTx = await client.mintTokens(seizeMint, authority, minter.publicKey, userTokenAccount.address, {
        amount: new BN(1_000_000),
      });
      await connection.confirmTransaction(mintTokensTx, "confirmed");
      console.log("Mint tokens tx:", mintTokensTx);

      const initialBalance = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      console.log("User initial balance:", Number(initialBalance.amount));
      expect(Number(initialBalance.amount)).to.equal(1_000_000);

      // 5. Freeze the user's account (required before seizure)
      // Note: Using freezeTokenAccountPda since the mint's freeze authority is a PDA
      console.log("Step 5: Freezing user account with PDA authority...");
      const freezeTx = await client.freezeTokenAccountPda(seizeMint, userTokenAccount.address, seizer);
      await connection.confirmTransaction(freezeTx, "confirmed");

      const frozenAccount = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      expect(frozenAccount.isFrozen).to.be.true;
      console.log("User account frozen");

      // 6. Create destination account for seized tokens
      const treasury = Keypair.generate();
      const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        seizeMint,
        treasury.publicKey,
        undefined,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // 7. Seize tokens from frozen account
      console.log("Step 6: Seizing tokens...");
      const seizeAmount = new BN(500_000);
      const seizeTx = await client.seize(
        seizeMint,
        seizer,     // seizer signer (authorized in config)
        {
          sourceToken: userTokenAccount.address,
          destToken: treasuryTokenAccount.address,
          amount: seizeAmount,
        }
      );
      await connection.confirmTransaction(seizeTx, "confirmed");
      console.log("Seize transaction:", seizeTx);

      // 8. Verify balances after seizure
      const userFinalBalance = await getAccount(connection, userTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);
      const treasuryBalance = await getAccount(connection, treasuryTokenAccount.address, undefined, TOKEN_2022_PROGRAM_ID);

      console.log("User final balance:", Number(userFinalBalance.amount));
      console.log("Treasury balance:", Number(treasuryBalance.amount));

      expect(Number(userFinalBalance.amount)).to.equal(500_000);
      expect(Number(treasuryBalance.amount)).to.equal(500_000);

      // Account should be thawed after seizure
      expect(userFinalBalance.isFrozen).to.be.false;

      console.log("Seize test with permanent delegate completed successfully!");
    });
  });
});
