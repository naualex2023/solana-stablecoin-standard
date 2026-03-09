/**
 * Basic usage example for SSS Token SDK
 * Demonstrates initialization, minting, burning, and compliance features
 */

import { 
  SSSTokenClient, 
  AnchorProvider,
  getOrCreateTokenAccount,
  createTokenMint,
  findConfigPDA
} from '../src/index';
import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';

async function main() {
  // 1. Setup connection and provider
  console.log('Setting up connection...');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const authority = Keypair.generate();
  
  // Fund authority (for devnet testing)
  const balance = await connection.getBalance(authority.publicKey);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log('Airdropping SOL to authority...');
    const airdrop = await connection.requestAirdrop(
      authority.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdrop);
  }

  const provider = new AnchorProvider(connection, { payer: authority });
  const sdk = new SSSTokenClient({ provider });

  // 2. Create roles
  const minter = Keypair.generate();
  const blacklister = Keypair.generate();
  const pauser = Keypair.generate();
  const seizer = Keypair.generate();

  console.log('Generated role keypairs:');
  console.log('  Authority:', authority.publicKey.toString());
  console.log('  Minter:', minter.publicKey.toString());
  console.log('  Blacklister:', blacklister.publicKey.toString());
  console.log('  Pauser:', pauser.publicKey.toString());
  console.log('  Seizer:', seizer.publicKey.toString());

  // 3. Create token mint with freeze authority
  console.log('\nCreating token mint...');
  const mint = await createTokenMint(
    connection,
    authority,
    authority.publicKey, // mint authority
    seizer.publicKey, // freeze authority (for compliance)
    6 // decimals
  );
  console.log('Mint created:', mint.toString());

  // 4. Initialize stablecoin with SSS-2 features
  console.log('\nInitializing stablecoin...');
  const initTx = await sdk.initialize(mint, authority, {
    name: "Example Stablecoin",
    symbol: "EXST",
    uri: "https://example.com/exst.json",
    decimals: 6,
    enablePermanentDelegate: true, // Enable token seizure
    enableTransferHook: true, // Enable compliance checking
    defaultAccountFrozen: false
  });
  console.log('Initialize transaction:', initTx);

  // Verify config
  const configPDA = findConfigPDA(mint);
  console.log('Config PDA:', configPDA.pda.toString());
  const config = await sdk.getConfig(mint);
  console.log('Config verified:');
  console.log('  Name:', config.name);
  console.log('  Symbol:', config.symbol);
  console.log('  Paused:', config.paused);
  console.log('  Enable Permanent Delegate:', config.enablePermanentDelegate);
  console.log('  Enable Transfer Hook:', config.enableTransferHook);

  // 5. Update roles
  console.log('\nUpdating roles...');
  const updateRolesTx = await sdk.updateRoles(mint, authority, {
    newBlacklister: blacklister.publicKey,
    newPauser: pauser.publicKey,
    newSeizer: seizer.publicKey
  });
  console.log('Update roles transaction:', updateRolesTx);

  // 6. Add minter with quota
  console.log('\nAdding minter...');
  const addMinterTx = await sdk.addMinter(mint, authority, {
    minter: minter.publicKey,
    quota: new BN(10_000_000_000) // 10,000 tokens
  });
  console.log('Add minter transaction:', addMinterTx);

  // Verify minter info
  const minterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
  console.log('Minter info verified:');
  console.log('  Quota:', minterInfo.quota.toString());
  console.log('  Minted:', minterInfo.minted.toString());

  // 7. Create user token account
  console.log('\nCreating user token account...');
  const user = Keypair.generate();
  const userTokenAccount = await getOrCreateTokenAccount(
    connection,
    mint,
    user.publicKey,
    authority
  );
  console.log('User token account:', userTokenAccount.toString());

  // 8. Mint tokens to user
  console.log('\nMinting tokens to user...');
  const mintAmount = new BN(1_000_000); // 1 token
  const mintTx = await sdk.mintTokens(
    mint,
    authority,
    minter.publicKey,
    userTokenAccount,
    { amount: mintAmount }
  );
  console.log('Mint transaction:', mintTx);

  // Verify updated minter info
  const updatedMinterInfo = await sdk.getMinterInfo(mint, minter.publicKey);
  console.log('Updated minter info:');
  console.log('  Minted:', updatedMinterInfo.minted.toString());
  console.log('  Remaining quota:', updatedMinterInfo.quota.sub(updatedMinterInfo.minted).toString());

  // 9. Add user to blacklist (compliance example)
  console.log('\nAdding user to blacklist...');
  const addBlacklistTx = await sdk.addToBlacklist(mint, blacklister, {
    user: user.publicKey,
    reason: "Example compliance check"
  });
  console.log('Add to blacklist transaction:', addBlacklistTx);

  // Verify blacklist entry
  const isBlacklisted = await sdk.isBlacklisted(mint, user.publicKey);
  console.log('User blacklisted:', isBlacklisted);

  const blacklistEntry = await sdk.getBlacklistEntry(mint, user.publicKey);
  console.log('Blacklist entry:');
  console.log('  Reason:', blacklistEntry.reason);
  console.log('  Timestamp:', blacklistEntry.timestamp.toString());

  // 10. Create treasury and seize tokens
  console.log('\nCreating treasury account...');
  const treasury = Keypair.generate();
  const treasuryTokenAccount = await getOrCreateTokenAccount(
    connection,
    mint,
    treasury.publicKey,
    authority
  );
  console.log('Treasury token account:', treasuryTokenAccount.toString());

  console.log('\nSeizing tokens from blacklisted user...');
  const seizeTx = await sdk.seize(mint, seizer, {
    sourceToken: userTokenAccount,
    destToken: treasuryTokenAccount,
    amount: new BN(500_000) // Seize 0.5 tokens
  });
  console.log('Seize transaction:', seizeTx);

  // 11. Remove user from blacklist
  console.log('\nRemoving user from blacklist...');
  const removeBlacklistTx = await sdk.removeFromBlacklist(mint, blacklister, {
    user: user.publicKey
  });
  console.log('Remove from blacklist transaction:', removeBlacklistTx);

  const stillBlacklisted = await sdk.isBlacklisted(mint, user.publicKey);
  console.log('User still blacklisted:', stillBlacklisted);

  // 12. Pause and unpause (emergency controls)
  console.log('\nPausing token operations...');
  const pauseTx = await sdk.pause(mint, pauser);
  console.log('Pause transaction:', pauseTx);

  const pausedConfig = await sdk.getConfig(mint);
  console.log('Token paused:', pausedConfig.paused);

  console.log('\nUnpausing token operations...');
  const unpauseTx = await sdk.unpause(mint, pauser);
  console.log('Unpause transaction:', unpauseTx);

  const unpausedConfig = await sdk.getConfig(mint);
  console.log('Token paused:', unpausedConfig.paused);

  // 13. Burn remaining tokens
  console.log('\nBurning tokens from treasury...');
  const burnTx = await sdk.burnTokens(
    mint,
    treasuryTokenAccount,
    treasury,
    { amount: new BN(500_000) }
  );
  console.log('Burn transaction:', burnTx);

  // 14. Update minter quota
  console.log('\nUpdating minter quota...');
  const updateQuotaTx = await sdk.updateMinterQuota(mint, authority, {
    minter: minter.publicKey,
    newQuota: new BN(20_000_000_000) // Increase to 20,000 tokens
  });
  console.log('Update quota transaction:', updateQuotaTx);

  const updatedQuotaInfo = await sdk.getMinterInfo(mint, minter.publicKey);
  console.log('New quota:', updatedQuotaInfo.quota.toString());

  console.log('\n✅ All operations completed successfully!');
  console.log('\nSummary:');
  console.log('- Stablecoin initialized with SSS-2 compliance features');
  console.log('- Minter added with quota tracking');
  console.log('- Tokens minted and distributed');
  console.log('- User added to and removed from blacklist');
  console.log('- Tokens seized from blacklisted account');
  console.log('- Token operations paused and unpaused');
  console.log('- Tokens burned');
  console.log('- Minter quota updated');
}

// Run example
main().catch(console.error);