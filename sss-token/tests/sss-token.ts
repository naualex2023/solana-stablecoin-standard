import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { TransferHook } from "../target/types/transfer_hook";
import { 
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getMint,
  transfer,
  burn,
  freezeAccount,
  thawAccount
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { assert } from "chai";

describe("Stablecoin Integration Tests", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const sssTokenProgram = anchor.workspace.sssToken as Program<SssToken>;
  const transferHookProgram = anchor.workspace.transferHook as Program<TransferHook>;

  // Test keypairs
  const authority = provider.wallet as anchor.Wallet;
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const minter = Keypair.generate();
  const newAuthority = Keypair.generate();

  // PDAs and accounts
  let mintKeypair: Keypair;
  let mint: PublicKey;
  let config: PublicKey;
  let transferHookData: PublicKey;
  let configBump: number;
  let transferHookBump: number;

  // Token accounts
  let user1TokenAccount: PublicKey;
  let user2TokenAccount: PublicKey;
  let authorityTokenAccount: PublicKey;
  let treasuryTokenAccount: PublicKey;

  // Minter account
  let minterInfo: PublicKey;

  // Blacklist accounts
  let blacklistEntry1: PublicKey;
  let blacklistEntry2: PublicKey;

  const TOKEN_DECIMALS = 6;
  const INITIAL_QUOTA = new anchor.BN(1_000_000 * 10 ** TOKEN_DECIMALS);
  const MINT_AMOUNT = new anchor.BN(100 * 10 ** TOKEN_DECIMALS);
  const SEIZURE_AMOUNT = new anchor.BN(50 * 10 ** TOKEN_DECIMALS);

  // Helper function to derive PDA
  const findConfigPDA = async (mintKey: PublicKey): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
      [Buffer.from("config"), mintKey.toBuffer()],
      sssTokenProgram.programId
    );
  };

  const findTransferHookPDA = async (mintKey: PublicKey): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
      [Buffer.from("transfer_hook"), mintKey.toBuffer()],
      transferHookProgram.programId
    );
  };

  const findMinterInfoPDA = async (configKey: PublicKey, minterKey: PublicKey): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
      [Buffer.from("minter"), configKey.toBuffer(), minterKey.toBuffer()],
      sssTokenProgram.programId
    );
  };

  const findBlacklistEntryPDA = async (configKey: PublicKey, userKey: PublicKey): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
      [Buffer.from("blacklist"), configKey.toBuffer(), userKey.toBuffer()],
      sssTokenProgram.programId
    );
  };

  // Airdrop helper
  const airdrop = async (keypair: Keypair, amount: number = 2 * 10 ** 9) => {
    const signature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      amount
    );
    await provider.connection.confirmTransaction(signature);
  };

  before(async () => {
    // Fund test accounts
    await airdrop(user1);
    await airdrop(user2);
    await airdrop(minter);
    await airdrop(newAuthority);

    // Generate a keypair for the mint
    mintKeypair = Keypair.generate();
    mint = mintKeypair.publicKey;

    // Derive PDAs
    [config, configBump] = await findConfigPDA(mint);
    [transferHookData, transferHookBump] = await findTransferHookPDA(mint);
    [minterInfo] = await findMinterInfoPDA(config, minter.publicKey);
    [blacklistEntry1] = await findBlacklistEntryPDA(config, user1.publicKey);
    [blacklistEntry2] = await findBlacklistEntryPDA(config, user2.publicKey);
  });

  describe("1. Initialization Tests", () => {
    it("Should initialize stablecoin config", async () => {
      const tx = await sssTokenProgram.methods
        .initialize(
          "Stable USD Token",
          "SUSD",
          "https://example.com/metadata.json",
          TOKEN_DECIMALS,
          true, // enable_permanent_delegate
          true, // enable_transfer_hook
          false // default_account_frozen
        )
        .accounts({
          config,
          mint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();

      console.log("Initialize transaction:", tx);

      // Now create token accounts after initialization
      user1TokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        user1.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      user2TokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        user2.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      authorityTokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        authority.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      treasuryTokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        authority.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Verify config
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.equal(configAccount.masterAuthority.toString(), authority.publicKey.toString());
      assert.equal(configAccount.name, "Stable USD Token");
      assert.equal(configAccount.symbol, "SUSD");
      assert.equal(configAccount.paused, false);
      assert.equal(configAccount.enablePermanentDelegate, true);
      assert.equal(configAccount.enableTransferHook, true);
      assert.equal(configAccount.defaultAccountFrozen, false);
    });

    it("Should initialize transfer hook", async () => {
      const tx = await transferHookProgram.methods
        .initialize()
        .accounts({
          hookData: transferHookData,
          mint,
          stablecoinProgram: sssTokenProgram.programId,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Transfer hook initialize transaction:", tx);

      // Verify transfer hook data
      const hookData = await transferHookProgram.account.transferHookData.fetch(transferHookData);
      assert.equal(hookData.stablecoinProgram.toString(), sssTokenProgram.programId.toString());
      assert.equal(hookData.mint.toString(), mint.toString());
      assert.equal(hookData.paused, false);
    });

    it("Should fail to initialize twice", async () => {
      try {
        await sssTokenProgram.methods
          .initialize(
            "Duplicate Token",
            "DUP",
            "https://example.com/duplicate.json",
            TOKEN_DECIMALS,
            false,
            false,
            false
          )
          .accounts({
            config,
            mint,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "already in use");
      }
    });
  });

  describe("2. Minter Management Tests", () => {
    it("Should add a minter with quota", async () => {
      const tx = await sssTokenProgram.methods
        .addMinter(INITIAL_QUOTA)
        .accounts({
          config,
          mint,
          minter: minter.publicKey,
          minterInfo,
          masterAuthority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Add minter transaction:", tx);

      // Verify minter info
      const minterAccount = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      assert.equal(minterAccount.authority.toString(), minter.publicKey.toString());
      assert.equal(minterAccount.quota.toString(), INITIAL_QUOTA.toString());
      assert.equal(minterAccount.minted.toString(), "0");
    });

    it("Should update minter quota", async () => {
      const newQuota = new anchor.BN(2_000_000 * 10 ** TOKEN_DECIMALS);
      
      const tx = await sssTokenProgram.methods
        .updateMinterQuota(newQuota)
        .accounts({
          config,
          mint,
          minter: minter.publicKey,
          minterInfo,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      console.log("Update minter quota transaction:", tx);

      // Verify updated quota
      const minterAccount = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      assert.equal(minterAccount.quota.toString(), newQuota.toString());
    });

    it("Should fail to add minter without master authority", async () => {
      const unauthorizedMinter = Keypair.generate();
      const unauthorizedMinterInfo = (
        await findMinterInfoPDA(config, unauthorizedMinter.publicKey)
      )[0];

      try {
        await sssTokenProgram.methods
          .addMinter(new anchor.BN(1000000))
          .accounts({
            config,
            mint,
            minter: unauthorizedMinter.publicKey,
            minterInfo: unauthorizedMinterInfo,
            masterAuthority: user1.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });

    it("Should remove minter", async () => {
      const tx = await sssTokenProgram.methods
        .removeMinter()
        .accounts({
          config,
          mint,
          minter: minter.publicKey,
          minterInfo,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      console.log("Remove minter transaction:", tx);

      // Verify quota is set to 0
      const minterAccount = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      assert.equal(minterAccount.quota.toString(), "0");

      // Re-add for subsequent tests
      await sssTokenProgram.methods
        .addMinter(INITIAL_QUOTA)
        .accounts({
          config,
          mint,
          minter: minter.publicKey,
          minterInfo,
          masterAuthority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });
  });

  describe("3. Token Minting Tests", () => {
    it("Should mint tokens to user account", async () => {
      const tx = await sssTokenProgram.methods
        .mintTokens(MINT_AMOUNT)
        .accounts({
          config,
          mint,
          minterInfo,
          minter: minter.publicKey,
          tokenAccount: user1TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      console.log("Mint tokens transaction:", tx);

      // Verify minted amount
      const tokenAccount = await getAccount(provider.connection, user1TokenAccount);
      assert.equal(tokenAccount.amount.toString(), MINT_AMOUNT.toString());

      // Verify minter quota updated
      const minterAccount = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      assert.equal(minterAccount.minted.toString(), MINT_AMOUNT.toString());
    });

    it("Should fail to mint when quota exceeded", async () => {
      const amount = INITIAL_QUOTA.add(new anchor.BN(1));

      try {
        await sssTokenProgram.methods
          .mintTokens(amount)
          .accounts({
            config,
            mint,
            minterInfo,
            minter: minter.publicKey,
            tokenAccount: user1TokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "QuotaExceeded");
      }
    });

    it("Should fail to mint when token is paused", async () => {
      // Pause the token
      await sssTokenProgram.methods
        .pause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      try {
        await sssTokenProgram.methods
          .mintTokens(new anchor.BN(1000))
          .accounts({
            config,
            mint,
            minterInfo,
            minter: minter.publicKey,
            tokenAccount: user1TokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "TokenPaused");
      }

      // Unpause for subsequent tests
      await sssTokenProgram.methods
        .unpause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();
    });
  });

  describe("4. Token Burning Tests", () => {
    it("Should burn tokens from account", async () => {
      const initialAmount = MINT_AMOUNT;
      const burnAmount = new anchor.BN(10 * 10 ** TOKEN_DECIMALS);

      const tx = await sssTokenProgram.methods
        .burnTokens(burnAmount)
        .accounts({
          config,
          mint,
          tokenAccount: user1TokenAccount,
          burner: user1.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      console.log("Burn tokens transaction:", tx);

      // Verify burned amount
      const tokenAccount = await getAccount(provider.connection, user1TokenAccount);
      const expectedAmount = initialAmount.sub(burnAmount);
      assert.equal(tokenAccount.amount.toString(), expectedAmount.toString());
    });

    it("Should fail to burn when token is paused", async () => {
      // Pause the token
      await sssTokenProgram.methods
        .pause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      try {
        await sssTokenProgram.methods
          .burnTokens(new anchor.BN(1000))
          .accounts({
            config,
            mint,
            tokenAccount: user1TokenAccount,
            burner: user1.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "TokenPaused");
      }

      // Unpause for subsequent tests
      await sssTokenProgram.methods
        .unpause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();
    });
  });

  describe("5. Freeze/Thaw Account Tests", () => {
    it("Should freeze a token account", async () => {
      const tx = await sssTokenProgram.methods
        .freezeTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: user1TokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("Freeze account transaction:", tx);

      // Verify account is frozen
      const tokenAccount = await getAccount(provider.connection, user1TokenAccount);
      assert.isTrue(tokenAccount.isFrozen);
    });

    it("Should fail to transfer from frozen account", async () => {
      try {
        await transfer(
          provider.connection,
          authority.payer,
          user1TokenAccount,
          user2TokenAccount,
          user1,
          1000,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "AccountFrozen");
      }
    });

    it("Should thaw a token account", async () => {
      const tx = await sssTokenProgram.methods
        .thawTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: user1TokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("Thaw account transaction:", tx);

      // Verify account is not frozen
      const tokenAccount = await getAccount(provider.connection, user1TokenAccount);
      assert.isFalse(tokenAccount.isFrozen);
    });
  });

  describe("6. Pause/Unpause Tests", () => {
    it("Should pause token operations", async () => {
      const tx = await sssTokenProgram.methods
        .pause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      console.log("Pause transaction:", tx);

      // Verify paused state
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.isTrue(configAccount.paused);
    });

    it("Should unpause token operations", async () => {
      const tx = await sssTokenProgram.methods
        .unpause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      console.log("Unpause transaction:", tx);

      // Verify unpaused state
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.isFalse(configAccount.paused);
    });

    it("Should fail to pause without pauser authority", async () => {
      try {
        await sssTokenProgram.methods
          .pause()
          .accounts({
            config,
            mint,
            pauser: user1.publicKey,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });
  });

  describe("7. Blacklist Management Tests", () => {
    it("Should add user to blacklist", async () => {
      const reason = "Suspicious activity detected";

      const tx = await sssTokenProgram.methods
        .addToBlacklist(reason)
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: user1.publicKey,
          blacklistEntry: blacklistEntry1,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Add to blacklist transaction:", tx);

      // Verify blacklist entry
      const blacklistAccount = await sssTokenProgram.account.blacklistEntry.fetch(
        blacklistEntry1
      );
      assert.equal(blacklistAccount.user.toString(), user1.publicKey.toString());
      assert.equal(blacklistAccount.reason, reason);
      assert.isAbove(blacklistAccount.timestamp.toNumber(), 0);
    });

    it("Should remove user from blacklist", async () => {
      const tx = await sssTokenProgram.methods
        .removeFromBlacklist()
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: user1.publicKey,
          blacklistEntry: blacklistEntry1,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Remove from blacklist transaction:", tx);

      // Verify account is closed
      try {
        await sssTokenProgram.account.blacklistEntry.fetch(blacklistEntry1);
        assert.fail("Account should be closed");
      } catch (error) {
        assert.include(error.toString(), "Account does not exist");
      }
    });

    it("Should fail to blacklist without blacklister authority", async () => {
      try {
        await sssTokenProgram.methods
          .addToBlacklist("Unauthorized attempt")
          .accounts({
            config,
            mint,
            blacklister: user1.publicKey,
            user: user2.publicKey,
            blacklistEntry: blacklistEntry2,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });

    it("Should fail to blacklist when transfer hook not enabled", async () => {
      // Create a new config without transfer hook
      const mintNoHook = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        authority.publicKey,
        TOKEN_DECIMALS,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const [configNoHook] = await findConfigPDA(mintNoHook);

      await sssTokenProgram.methods
        .initialize(
          "No Hook Token",
          "NOHK",
          "https://example.com/nohook.json",
          TOKEN_DECIMALS,
          false,
          false,
          false
        )
        .accounts({
          config: configNoHook,
          mint: mintNoHook,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const [blEntry] = await findBlacklistEntryPDA(configNoHook, user1.publicKey);

      try {
        await sssTokenProgram.methods
          .addToBlacklist("Test reason")
          .accounts({
            config: configNoHook,
            mint: mintNoHook,
            blacklister: authority.publicKey,
            user: user1.publicKey,
            blacklistEntry: blEntry,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "ComplianceNotEnabled");
      }
    });
  });

  describe("8. Seize Tokens Tests", () => {
    it("Should seize tokens from frozen account", async () => {
      // Freeze user1 account
      await sssTokenProgram.methods
        .freezeTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: user1TokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Get initial balances
      const sourceBefore = await getAccount(provider.connection, user1TokenAccount);
      const destBefore = await getAccount(provider.connection, treasuryTokenAccount);

      // Seize tokens
      const tx = await sssTokenProgram.methods
        .seize(SEIZURE_AMOUNT)
        .accounts({
          config,
          mint,
          sourceToken: user1TokenAccount,
          destToken: treasuryTokenAccount,
          seizer: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("Seize tokens transaction:", tx);

      // Verify balances
      const sourceAfter = await getAccount(provider.connection, user1TokenAccount);
      const destAfter = await getAccount(provider.connection, treasuryTokenAccount);

      const expectedSource = new anchor.BN(sourceBefore.amount).sub(SEIZURE_AMOUNT);
      const expectedDest = new anchor.BN(destBefore.amount).add(SEIZURE_AMOUNT);

      assert.equal(sourceAfter.amount.toString(), expectedSource.toString());
      assert.equal(destAfter.amount.toString(), expectedDest.toString());
    });

    it("Should fail to seize without seizer authority", async () => {
      try {
        await sssTokenProgram.methods
          .seize(new anchor.BN(1000))
          .accounts({
            config,
            mint,
            sourceToken: user1TokenAccount,
            destToken: treasuryTokenAccount,
            seizer: user1.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });

    it("Should fail to seize when permanent delegate not enabled", async () => {
      // Create config without permanent delegate
      const mintNoDelegate = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        authority.publicKey,
        TOKEN_DECIMALS,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const [configNoDelegate] = await findConfigPDA(mintNoDelegate);

      await sssTokenProgram.methods
        .initialize(
          "No Delegate Token",
          "NODEL",
          "https://example.com/nodelegate.json",
          TOKEN_DECIMALS,
          false,
          false,
          false
        )
        .accounts({
          config: configNoDelegate,
          mint: mintNoDelegate,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const [tokenAcc] = await PublicKey.findProgramAddressSync(
        [Buffer.from("token"), user1.publicKey.toBuffer()],
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await sssTokenProgram.methods
          .seize(new anchor.BN(1000))
          .accounts({
            config: configNoDelegate,
            mint: mintNoDelegate,
            sourceToken: user1TokenAccount,
            destToken: treasuryTokenAccount,
            seizer: authority.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "PermanentDelegateNotEnabled");
      }
    });
  });

  describe("9. Role Management Tests", () => {
    it("Should update roles", async () => {
      const newBlacklister = user1.publicKey;
      const newPauser = user2.publicKey;
      const newSeizer = minter.publicKey;

      const tx = await sssTokenProgram.methods
        .updateRoles(newBlacklister, newPauser, newSeizer)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      console.log("Update roles transaction:", tx);

      // Verify updated roles
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.equal(configAccount.blacklister.toString(), newBlacklister.toString());
      assert.equal(configAccount.pauser.toString(), newPauser.toString());
      assert.equal(configAccount.seizer.toString(), newSeizer.toString());

      // Restore original roles
      await sssTokenProgram.methods
        .updateRoles(authority.publicKey, authority.publicKey, authority.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();
    });

    it("Should fail to update roles without master authority", async () => {
      try {
        await sssTokenProgram.methods
          .updateRoles(
            user1.publicKey,
            user2.publicKey,
            minter.publicKey
          )
          .accounts({
            config,
            mint,
            masterAuthority: user1.publicKey,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });
  });

  describe("10. Authority Transfer Tests", () => {
    it("Should transfer master authority", async () => {
      const tx = await sssTokenProgram.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      console.log("Transfer authority transaction:", tx);

      // Verify new authority
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.equal(
        configAccount.masterAuthority.toString(),
        newAuthority.publicKey.toString()
      );

      // Transfer back for subsequent tests
      await sssTokenProgram.methods
        .transferAuthority(authority.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();
    });

    it("Should fail to transfer authority without current authority", async () => {
      try {
        await sssTokenProgram.methods
          .transferAuthority(user1.publicKey)
          .accounts({
            config,
            mint,
            masterAuthority: user1.publicKey,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "Unauthorized");
      }
    });
  });

  describe("11. Transfer Hook Tests", () => {
    it("Should pause transfer hook", async () => {
      const tx = await transferHookProgram.methods
        .pause()
        .accounts({
          hookData: transferHookData,
          mint,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("Pause transfer hook transaction:", tx);

      // Verify paused state
      const hookData = await transferHookProgram.account.transferHookData.fetch(
        transferHookData
      );
      assert.isTrue(hookData.paused);
    });

    it("Should unpause transfer hook", async () => {
      const tx = await transferHookProgram.methods
        .unpause()
        .accounts({
          hookData: transferHookData,
          mint,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("Unpause transfer hook transaction:", tx);

      // Verify unpaused state
      const hookData = await transferHookProgram.account.transferHookData.fetch(
        transferHookData
      );
      assert.isFalse(hookData.paused);
    });

    it("Should update transfer hook authority", async () => {
      const tx = await transferHookProgram.methods
        .updateAuthority(newAuthority.publicKey)
        .accounts({
          hookData: transferHookData,
          mint,
          authority: authority.publicKey,
        })
        .rpc();

      console.log("Update transfer hook authority transaction:", tx);

      // Verify new authority
      const hookData = await transferHookProgram.account.transferHookData.fetch(
        transferHookData
      );
      assert.equal(
        hookData.authority.toString(),
        newAuthority.publicKey.toString()
      );

      // Transfer back
      await transferHookProgram.methods
        .updateAuthority(authority.publicKey)
        .accounts({
          hookData: transferHookData,
          mint,
          authority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();
    });

    it("Should fail to pause without authority", async () => {
      try {
        await transferHookProgram.methods
          .pause()
          .accounts({
            hookData: transferHookData,
            mint,
            authority: user1.publicKey,
          })
          .signers([user1])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "InvalidTransferHookAccount");
      }
    });
  });

  describe("12. Edge Cases and Error Handling", () => {
    it("Should fail with invalid name length", async () => {
      const mintInvalid = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        authority.publicKey,
        TOKEN_DECIMALS,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const [configInvalid] = await findConfigPDA(mintInvalid);

      try {
        await sssTokenProgram.methods
          .initialize(
            "A".repeat(101), // Exceeds max length of 100
            "INV",
            "https://example.com/invalid.json",
            TOKEN_DECIMALS,
            false,
            false,
            false
          )
          .accounts({
            config: configInvalid,
            mint: mintInvalid,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "InvalidAccount");
      }
    });

    it("Should fail with invalid symbol length", async () => {
      const mintInvalid = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        authority.publicKey,
        TOKEN_DECIMALS,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const [configInvalid] = await findConfigPDA(mintInvalid);

      try {
        await sssTokenProgram.methods
          .initialize(
            "Invalid Token",
            "A".repeat(11), // Exceeds max length of 10
            "https://example.com/invalid.json",
            TOKEN_DECIMALS,
            false,
            false,
            false
          )
          .accounts({
            config: configInvalid,
            mint: mintInvalid,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "InvalidAccount");
      }
    });

    it("Should fail with invalid URI length", async () => {
      const mintInvalid = await createMint(
        provider.connection,
        authority.payer,
        authority.publicKey,
        authority.publicKey,
        TOKEN_DECIMALS,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const [configInvalid] = await findConfigPDA(mintInvalid);

      try {
        await sssTokenProgram.methods
          .initialize(
            "Invalid Token",
            "INV",
            "A".repeat(201), // Exceeds max length of 200
            TOKEN_DECIMALS,
            false,
            false,
            false
          )
          .accounts({
            config: configInvalid,
            mint: mintInvalid,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "InvalidAccount");
      }
    });

    it("Should fail to add blacklist with invalid reason length", async () => {
      const [blEntry] = await findBlacklistEntryPDA(config, user1.publicKey);

      try {
        await sssTokenProgram.methods
          .addToBlacklist("A".repeat(101)) // Exceeds max length of 100
          .accounts({
            config,
            mint,
            blacklister: authority.publicKey,
            user: user1.publicKey,
            blacklistEntry: blEntry,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "InvalidAccount");
      }
    });

    it("Should handle multiple minting operations correctly", async () => {
      const initialMinted = (await sssTokenProgram.account.minterInfo.fetch(minterInfo)).minted;
      
      // Mint small amounts multiple times
      const smallAmount = new anchor.BN(1000);
      for (let i = 0; i < 5; i++) {
        await sssTokenProgram.methods
          .mintTokens(smallAmount)
          .accounts({
            config,
            mint,
            minterInfo,
            minter: minter.publicKey,
            tokenAccount: user2TokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
      }

      const finalMinted = (await sssTokenProgram.account.minterInfo.fetch(minterInfo)).minted;
      const expectedMinted = initialMinted.add(smallAmount.mul(new anchor.BN(5)));
      
      assert.equal(finalMinted.toString(), expectedMinted.toString());
    });

    it("Should verify config account structure", async () => {
      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      
      // Verify all fields are present
      assert.exists(configAccount.masterAuthority);
      assert.exists(configAccount.mint);
      assert.exists(configAccount.name);
      assert.exists(configAccount.symbol);
      assert.exists(configAccount.uri);
      assert.exists(configAccount.decimals);
      assert.exists(configAccount.paused);
      assert.exists(configAccount.bump);
      assert.exists(configAccount.enablePermanentDelegate);
      assert.exists(configAccount.enableTransferHook);
      assert.exists(configAccount.defaultAccountFrozen);
      assert.exists(configAccount.blacklister);
      assert.exists(configAccount.pauser);
      assert.exists(configAccount.seizer);
    });

    it("Should verify minter info account structure", async () => {
      const minterAccount = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      
      // Verify all fields are present
      assert.exists(minterAccount.authority);
      assert.exists(minterAccount.quota);
      assert.exists(minterAccount.minted);
      assert.exists(minterAccount.bump);
    });

    it("Should verify blacklist entry structure when created", async () => {
      const reason = "Compliance check";
      const tx = await sssTokenProgram.methods
        .addToBlacklist(reason)
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: user2.publicKey,
          blacklistEntry: blacklistEntry2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const blacklistAccount = await sssTokenProgram.account.blacklistEntry.fetch(blacklistEntry2);
      
      // Verify all fields
      assert.equal(blacklistAccount.user.toString(), user2.publicKey.toString());
      assert.equal(blacklistAccount.reason, reason);
      assert.isAbove(blacklistAccount.timestamp.toNumber(), 0);
      assert.exists(blacklistAccount.bump);
      
      // Clean up
      await sssTokenProgram.methods
        .removeFromBlacklist()
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: user2.publicKey,
          blacklistEntry: blacklistEntry2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("Should verify transfer hook data structure", async () => {
      const hookData = await transferHookProgram.account.transferHookData.fetch(transferHookData);
      
      // Verify all fields
      assert.exists(hookData.stablecoinProgram);
      assert.exists(hookData.mint);
      assert.exists(hookData.authority);
      assert.exists(hookData.paused);
      assert.exists(hookData.bump);
    });

    it("Should successfully thaw previously frozen account", async () => {
      // Ensure account is frozen
      const accountBefore = await getAccount(provider.connection, user1TokenAccount);
      if (!accountBefore.isFrozen) {
        await sssTokenProgram.methods
          .freezeTokenAccount()
          .accounts({
            config,
            mint,
            tokenAccount: user1TokenAccount,
            freezeAuthority: authority.publicKey,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
      }

      // Thaw the account
      await sssTokenProgram.methods
        .thawTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: user1TokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify account is not frozen
      const accountAfter = await getAccount(provider.connection, user1TokenAccount);
      assert.isFalse(accountAfter.isFrozen);
    });

    it("Should handle zero amount transfers gracefully", async () => {
      // Try to transfer zero amount - this should be allowed by token program
      try {
        await transfer(
          provider.connection,
          authority.payer,
          user1TokenAccount,
          user2TokenAccount,
          user1,
          0,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
      } catch (error) {
        // Zero amount transfers might be rejected, that's acceptable
        console.log("Zero amount transfer result:", error);
      }
    });
  });

  describe("13. Integration Scenario Tests", () => {
    it("Should complete full lifecycle: mint, transfer, burn", async () => {
      // Create new accounts for this test
      const user3 = Keypair.generate();
      const user4 = Keypair.generate();
      await airdrop(user3);
      await airdrop(user4);

      const user3TokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        user3.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const user4TokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        user4.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const transferAmount = new anchor.BN(1000);
      const burnAmount = new anchor.BN(500);

      // Mint tokens to user3
      await sssTokenProgram.methods
        .mintTokens(transferAmount)
        .accounts({
          config,
          mint,
          minterInfo,
          minter: minter.publicKey,
          tokenAccount: user3TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      let account = await getAccount(provider.connection, user3TokenAccount);
      assert.equal(account.amount.toString(), transferAmount.toString());

      // Transfer from user3 to user4
      await transfer(
        provider.connection,
        authority.payer,
        user3TokenAccount,
        user4TokenAccount,
        user3,
        transferAmount.toNumber(),
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      account = await getAccount(provider.connection, user3TokenAccount);
      assert.equal(account.amount.toString(), "0");

      account = await getAccount(provider.connection, user4TokenAccount);
      assert.equal(account.amount.toString(), transferAmount.toString());

      // Burn from user4
      await sssTokenProgram.methods
        .burnTokens(burnAmount)
        .accounts({
          config,
          mint,
          tokenAccount: user4TokenAccount,
          burner: user4.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([user4])
        .rpc();

      account = await getAccount(provider.connection, user4TokenAccount);
      const expectedBalance = transferAmount.sub(burnAmount);
      assert.equal(account.amount.toString(), expectedBalance.toString());
    });

    it("Should handle compliance workflow: freeze, seize, thaw", async () => {
      const badActor = Keypair.generate();
      await airdrop(badActor);

      const badActorTokenAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        badActor.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const seizureAccount = await createAccount(
        provider.connection,
        authority.payer,
        mint,
        authority.publicKey,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      // Mint tokens to bad actor
      const initialAmount = new anchor.BN(10000);
      await sssTokenProgram.methods
        .mintTokens(initialAmount)
        .accounts({
          config,
          mint,
          minterInfo,
          minter: minter.publicKey,
          tokenAccount: badActorTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Add to blacklist
      const [blEntry] = await findBlacklistEntryPDA(config, badActor.publicKey);
      await sssTokenProgram.methods
        .addToBlacklist("Fraudulent activity")
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: badActor.publicKey,
          blacklistEntry: blEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Freeze account
      await sssTokenProgram.methods
        .freezeTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: badActorTokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify frozen
      const frozenAccount = await getAccount(provider.connection, badActorTokenAccount);
      assert.isTrue(frozenAccount.isFrozen);

      // Seize tokens
      const seizeAmount = new anchor.BN(8000);
      await sssTokenProgram.methods
        .seize(seizeAmount)
        .accounts({
          config,
          mint,
          sourceToken: badActorTokenAccount,
          destToken: seizureAccount,
          seizer: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify seizure
      const afterSeize = await getAccount(provider.connection, badActorTokenAccount);
      const expectedBalance = initialAmount.sub(seizeAmount);
      assert.equal(afterSeize.amount.toString(), expectedBalance.toString());

      // Remove from blacklist
      await sssTokenProgram.methods
        .removeFromBlacklist()
        .accounts({
          config,
          mint,
          blacklister: authority.publicKey,
          user: badActor.publicKey,
          blacklistEntry: blEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Thaw account
      await sssTokenProgram.methods
        .thawTokenAccount()
        .accounts({
          config,
          mint,
          tokenAccount: badActorTokenAccount,
          freezeAuthority: authority.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify thawed
      const thawedAccount = await getAccount(provider.connection, badActorTokenAccount);
      assert.isFalse(thawedAccount.isFrozen);
    });

    it("Should handle emergency pause workflow", async () => {
      // Pause all operations
      await sssTokenProgram.methods
        .pause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      const configAccount = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.isTrue(configAccount.paused);

      // Try to mint (should fail)
      try {
        await sssTokenProgram.methods
          .mintTokens(new anchor.BN(1000))
          .accounts({
            config,
            mint,
            minterInfo,
            minter: minter.publicKey,
            tokenAccount: user1TokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include(error.toString(), "TokenPaused");
      }

      // Unpause
      await sssTokenProgram.methods
        .unpause()
        .accounts({
          config,
          mint,
          pauser: authority.publicKey,
        })
        .rpc();

      const unpausedConfig = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.isFalse(unpausedConfig.paused);
    });

    it("Should handle authority transfer with minter preservation", async () => {
      const newMaster = Keypair.generate();
      await airdrop(newMaster);

      // Record initial minter state
      const minterBefore = await sssTokenProgram.account.minterInfo.fetch(minterInfo);

      // Transfer authority
      await sssTokenProgram.methods
        .transferAuthority(newMaster.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      // Verify authority transfer
      const configAfter = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.equal(configAfter.masterAuthority.toString(), newMaster.publicKey.toString());

      // Verify minter still exists with same state
      const minterAfter = await sssTokenProgram.account.minterInfo.fetch(minterInfo);
      assert.equal(minterAfter.authority.toString(), minterBefore.authority.toString());
      assert.equal(minterAfter.quota.toString(), minterBefore.quota.toString());
      assert.equal(minterAfter.minted.toString(), minterBefore.minted.toString());

      // Transfer back
      await sssTokenProgram.methods
        .transferAuthority(authority.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: newMaster.publicKey,
        })
        .signers([newMaster])
        .rpc();
    });

    it("Should handle role delegation with new authorities", async () => {
      const originalBlacklister = (
        await sssTokenProgram.account.stablecoinConfig.fetch(config)
      ).blacklister;

      // Assign new roles
      const newBlacklister = user1.publicKey;
      const newPauser = user2.publicKey;
      const newSeizer = minter.publicKey;

      await sssTokenProgram.methods
        .updateRoles(newBlacklister, newPauser, newSeizer)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();

      const configUpdated = await sssTokenProgram.account.stablecoinConfig.fetch(config);
      assert.equal(configUpdated.blacklister.toString(), newBlacklister.toString());
      assert.equal(configUpdated.pauser.toString(), newPauser.toString());
      assert.equal(configUpdated.seizer.toString(), newSeizer.toString());

      // Test new blacklister can add to blacklist
      const [blEntry] = await findBlacklistEntryPDA(config, user1.publicKey);
      await sssTokenProgram.methods
        .addToBlacklist("Test with new blacklister")
        .accounts({
          config,
          mint,
          blacklister: newBlacklister,
          user: user1.publicKey,
          blacklistEntry: blEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // Clean up
      await sssTokenProgram.methods
        .removeFromBlacklist()
        .accounts({
          config,
          mint,
          blacklister: newBlacklister,
          user: user1.publicKey,
          blacklistEntry: blEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // Restore original roles
      await sssTokenProgram.methods
        .updateRoles(originalBlacklister, authority.publicKey, authority.publicKey)
        .accounts({
          config,
          mint,
          masterAuthority: authority.publicKey,
        })
        .rpc();
    });
  });
});