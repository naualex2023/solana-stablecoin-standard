# SSS Token SDK

TypeScript SDK for the SSS Token Stablecoin Program on Solana. This SDK provides a comprehensive interface for interacting with SSS Token stablecoin, supporting both SSS-1 (minimal) and SSS-2 (compliant) features.

## Features

- **Stablecoin Management**: Initialize and configure stablecoin with customizable parameters
- **Minting & Burning**: Controlled minting with quota tracking and token burning
- **Access Control**: Role-based access control (master authority, blacklister, pauser, seizer)
- **Token Account Management**: Freeze/thaw token accounts
- **Compliance (SSS-2)**: Blacklist management and token seizure capabilities
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **PDA Utilities**: Easy derivation of all program PDAs

## Installation

```bash
npm install @sss-token/sdk
# or
yarn add @sss-token/sdk
```

## Quick Start

```typescript
import { SSSTokenClient, AnchorProvider } from '@sss-token/sdk';
import { Keypair, Connection } from '@solana/web3.js';

// Setup provider
const connection = new Connection('https://api.devnet.solana.com');
const wallet = new NodeWallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet);

// Initialize SDK
const sdk = new SSSTokenClient({ provider });

// Initialize stablecoin
const mint = await createMint(connection, payer, authority.publicKey, null, 6);

await sdk.initialize(mint, authority, {
  name: "My Stablecoin",
  symbol: "MYST",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  enablePermanentDelegate: true,
  enableTransferHook: true,
  defaultAccountFrozen: false
});
```

## API Reference

### SSSTokenClient

The main SDK client for interacting with the SSS Token program.

#### Constructor

```typescript
constructor(config: SSSTokenSDKConfig)
```

**Parameters:**
- `provider`: AnchorProvider instance
- `programId?: PublicKey`: Custom program ID (defaults to SSS_TOKEN_PROGRAM_ID)

#### Methods

##### Initialize Stablecoin

```typescript
async initialize(
  mint: PublicKey,
  authority: Signer,
  params: InitializeParams
): Promise<string>
```

Initializes a new stablecoin with specified configuration.

**Parameters:**
- `mint`: Token mint public key
- `authority`: Authority signer
- `params.name`: Token name (max 100 chars)
- `params.symbol`: Token symbol (max 10 chars)
- `params.uri`: Token metadata URI (max 200 chars)
- `params.decimals`: Number of decimals
- `params.enablePermanentDelegate`: Enable permanent delegate feature
- `params.enableTransferHook`: Enable transfer hook for compliance
- `params.defaultAccountFrozen`: Default freeze state for new accounts

**Returns:** Transaction signature

##### Mint Tokens

```typescript
async mintTokens(
  mint: PublicKey,
  mintAuthority: Signer,
  minter: PublicKey,
  tokenAccount: PublicKey,
  params: { amount: BN }
): Promise<string>
```

Mints tokens to a recipient account, respecting minter quota.

**Parameters:**
- `mint`: Token mint public key
- `mintAuthority`: Mint authority signer
- `minter`: Minter public key (must be added as minter)
- `tokenAccount`: Destination token account
- `params.amount`: Amount to mint

**Returns:** Transaction signature

##### Burn Tokens

```typescript
async burnTokens(
  mint: PublicKey,
  tokenAccount: PublicKey,
  burner: Signer,
  params: { amount: BN }
): Promise<string>
```

Burns tokens from an account.

**Parameters:**
- `mint`: Token mint public key
- `tokenAccount`: Source token account
- `burner`: Token owner signer
- `params.amount`: Amount to burn

**Returns:** Transaction signature

##### Freeze Token Account

```typescript
async freezeTokenAccount(
  mint: PublicKey,
  tokenAccount: PublicKey,
  freezeAuthority: Signer
): Promise<string>
```

Freezes a token account, preventing transfers.

**Parameters:**
- `mint`: Token mint public key
- `tokenAccount`: Token account to freeze
- `freezeAuthority`: Freeze authority signer

**Returns:** Transaction signature

##### Thaw Token Account

```typescript
async thawTokenAccount(
  mint: PublicKey,
  tokenAccount: PublicKey,
  freezeAuthority: Signer
): Promise<string>
```

Unfreezes a token account, allowing transfers.

**Parameters:**
- `mint`: Token mint public key
- `tokenAccount`: Token account to thaw
- `freezeAuthority`: Freeze authority signer

**Returns:** Transaction signature

##### Pause

```typescript
async pause(
  mint: PublicKey,
  pauser: Signer
): Promise<string>
```

Pauses all token operations.

**Parameters:**
- `mint`: Token mint public key
- `pauser`: Pauser role signer

**Returns:** Transaction signature

##### Unpause

```typescript
async unpause(
  mint: PublicKey,
  pauser: Signer
): Promise<string>
```

Unpauses all token operations.

**Parameters:**
- `mint`: Token mint public key
- `pauser`: Pauser role signer

**Returns:** Transaction signature

##### Add Minter

```typescript
async addMinter(
  mint: PublicKey,
  masterAuthority: Signer,
  params: { minter: PublicKey, quota: BN }
): Promise<string>
```

Adds a new minter with specified quota.

**Parameters:**
- `mint`: Token mint public key
- `masterAuthority`: Master authority signer
- `params.minter`: Minter public key to add
- `params.quota`: Minter's minting quota

**Returns:** Transaction signature

##### Update Minter Quota

```typescript
async updateMinterQuota(
  mint: PublicKey,
  masterAuthority: Signer,
  params: { minter: PublicKey, newQuota: BN }
): Promise<string>
```

Updates an existing minter's quota.

**Parameters:**
- `mint`: Token mint public key
- `masterAuthority`: Master authority signer
- `params.minter`: Minter public key
- `params.newQuota`: New quota value

**Returns:** Transaction signature

##### Remove Minter

```typescript
async removeMinter(
  mint: PublicKey,
  masterAuthority: Signer,
  params: { minter: PublicKey }
): Promise<string>
```

Removes a minter by setting quota to 0.

**Parameters:**
- `mint`: Token mint public key
- `masterAuthority`: Master authority signer
- `params.minter`: Minter public key to remove

**Returns:** Transaction signature

##### Update Roles

```typescript
async updateRoles(
  mint: PublicKey,
  masterAuthority: Signer,
  params: UpdateRolesParams
): Promise<string>
```

Updates role assignments.

**Parameters:**
- `mint`: Token mint public key
- `masterAuthority`: Master authority signer
- `params.newBlacklister`: New blacklister public key
- `params.newPauser`: New pauser public key
- `params.newSeizer`: New seizer public key

**Returns:** Transaction signature

##### Add to Blacklist

```typescript
async addToBlacklist(
  mint: PublicKey,
  blacklister: Signer,
  params: { user: PublicKey, reason: string }
): Promise<string>
```

Adds an address to the blacklist (SSS-2 compliance).

**Parameters:**
- `mint`: Token mint public key
- `blacklister`: Blacklister role signer
- `params.user`: User public key to blacklist
- `params.reason`: Reason for blacklisting (max 100 chars)

**Returns:** Transaction signature

##### Remove from Blacklist

```typescript
async removeFromBlacklist(
  mint: PublicKey,
  blacklister: Signer,
  params: { user: PublicKey }
): Promise<string>
```

Removes an address from the blacklist.

**Parameters:**
- `mint`: Token mint public key
- `blacklister`: Blacklister role signer
- `params.user`: User public key to remove

**Returns:** Transaction signature

##### Seize Tokens

```typescript
async seize(
  mint: PublicKey,
  seizer: Signer,
  params: { sourceToken: PublicKey, destToken: PublicKey, amount: BN }
): Promise<string>
```

Seizes tokens from an account (SSS-2 compliance).

**Parameters:**
- `mint`: Token mint public key
- `seizer`: Seizer role signer
- `params.sourceToken`: Source token account
- `params.destToken`: Destination token account
- `params.amount`: Amount to seize

**Returns:** Transaction signature

##### Transfer Authority

```typescript
async transferAuthority(
  mint: PublicKey,
  masterAuthority: Signer,
  params: { newMasterAuthority: PublicKey }
): Promise<string>
```

Transfers master authority to a new address.

**Parameters:**
- `mint`: Token mint public key
- `masterAuthority`: Current master authority signer
- `params.newMasterAuthority`: New master authority public key

**Returns:** Transaction signature

##### Query Methods

```typescript
// Fetch stablecoin config
async getConfig(mint: PublicKey): Promise<StablecoinConfig>

// Fetch minter info
async getMinterInfo(mint: PublicKey, minter: PublicKey): Promise<MinterInfo>

// Fetch blacklist entry
async getBlacklistEntry(mint: PublicKey, user: PublicKey): Promise<BlacklistEntry>

// Check if user is blacklisted
async isBlacklisted(mint: PublicKey, user: PublicKey): Promise<boolean>

// Get associated token account address
async getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): Promise<PublicKey>
```

## PDA Utilities

The SDK provides utilities for deriving PDAs:

```typescript
import { 
  findConfigPDA, 
  findMinterInfoPDA, 
  findBlacklistEntryPDA,
  findAllPDAs 
} from '@sss-token/sdk';

// Find config PDA
const { pda: configPda, bump } = findConfigPDA(mint);

// Find minter info PDA
const { pda: minterInfoPda } = findMinterInfoPDA(configPda, minterPubkey);

// Find blacklist entry PDA
const { pda: blacklistEntryPda } = findBlacklistEntryPDA(configPda, userPubkey);

// Find all PDAs at once
const pdas = findAllPDAs(mint);
const minterInfoPda = pdas.getMinterInfo(minterPubkey);
const blacklistEntryPda = pdas.getBlacklistEntry(userPubkey);
```

## Helper Utilities

Token account and utility functions:

```typescript
import {
  getOrCreateTokenAccount,
  createTokenMint,
  mintTo,
  burn,
  transfer,
  freezeAccount,
  thawAccount,
  getTokenBalance,
  lamportsToSol,
  solToLamports
} from '@sss-token/sdk';

// Get or create token account
const tokenAccount = await getOrCreateTokenAccount(
  connection,
  mint,
  owner,
  payer
);

// Create new token mint
const mint = await createTokenMint(
  connection,
  payer,
  mintAuthority,
  freezeAuthority,
  decimals
);

// Get token balance
const balance = await getTokenBalance(connection, tokenAccount);

// Convert SOL/lamports
const solAmount = lamportsToSol(lamports);
const lamports = solToLamports(solAmount);
```

## Error Handling

The SDK throws errors for various failure conditions:

```typescript
import { SSS_TOKEN_ERROR_CODE } from '@sss-token/sdk';

try {
  await sdk.mintTokens(mint, authority, minter, tokenAccount, { amount });
} catch (error) {
  if (error.code === SSS_TOKEN_ERROR_CODE.QuotaExceeded) {
    console.log("Minting quota exceeded");
  } else if (error.code === SSS_TOKEN_ERROR_CODE.TokenPaused) {
    console.log("Token operations are paused");
  }
}
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | Unauthorized | Unauthorized access |
| 6001 | InvalidAccount | Invalid account |
| 6002 | QuotaExceeded | Mint quota exceeded |
| 6003 | AccountFrozen | Account is frozen |
| 6004 | TokenPaused | Token is paused |
| 6005 | ComplianceNotEnabled | Compliance module not enabled |
| 6006 | PermanentDelegateNotEnabled | Permanent delegate not enabled |
| 6007 | AlreadyBlacklisted | Already in blacklist |
| 6008 | NotBlacklisted | Not in blacklist |
| 6009 | InvalidAmount | Invalid amount |

## Constants

```typescript
import { 
  SSS_TOKEN_PROGRAM_ID,
  PDA_SEEDS,
  MAX_LENGTHS 
} from '@sss-token/sdk';

// Program ID
console.log(SSS_TOKEN_PROGRAM_ID); // "Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw"

// PDA seeds
console.log(PDA_SEEDS.CONFIG); // "config"
console.log(PDA_SEEDS.MINTER); // "minter"
console.log(PDA_SEEDS.BLACKLIST); // "blacklist"

// Maximum string lengths
console.log(MAX_LENGTHS.NAME); // 100
console.log(MAX_LENGTHS.SYMBOL); // 10
console.log(MAX_LENGTHS.URI); // 200
console.log(MAX_LENGTHS.REASON); // 100
```

## Testing

### Quick Test with Automated Script

For a complete automated testing experience, use the provided test script from the parent directory:

```bash
# From sss-token directory (not sss-token/sdk)
./test.sh
```

The `test.sh` script automatically:
- Starts local Solana validator
- Requests airdrop if needed
- Builds and deploys Anchor programs
- Runs all SDK tests
- Cleans up validator

**Options:**
```bash
./test.sh --clean        # Clean ledger and start fresh
./test.sh --skip-deploy  # Skip program deployment
./test.sh --no-stop      # Keep validator running
./test.sh --help         # Show all options
```

See [TEST_SCRIPT_GUIDE.md](../TEST_SCRIPT_GUIDE.md) for complete documentation.

### Manual Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint
```

## Example: Complete Workflow

```typescript
import { SSSTokenClient, AnchorProvider } from '@sss-token/sdk';
import { Keypair, Connection } from '@solana/web3.js';
import BN from 'bn.js';

async function completeWorkflow() {
  // Setup
  const connection = new Connection('https://api.devnet.solana.com');
  const authority = Keypair.generate();
  const minter = Keypair.generate();
  const blacklister = Keypair.generate();
  const pauser = Keypair.generate();
  const seizer = Keypair.generate();
  
  const provider = new AnchorProvider(connection, { payer: authority });
  const sdk = new SSSTokenClient({ provider });

  // 1. Create mint
  const mint = await createMint(
    connection,
    authority,
    authority.publicKey,
    seizer.publicKey, // freeze authority
    6
  );

  // 2. Initialize stablecoin with SSS-2 features
  await sdk.initialize(mint, authority, {
    name: "Compliant Stablecoin",
    symbol: "CUSD",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false
  });

  // 3. Add minter with quota
  await sdk.addMinter(mint, authority, {
    minter: minter.publicKey,
    quota: new BN(1_000_000_000)
  });

  // 4. Update roles
  await sdk.updateRoles(mint, authority, {
    newBlacklister: blacklister.publicKey,
    newPauser: pauser.publicKey,
    newSeizer: seizer.publicKey
  });

  // 5. Mint tokens to user
  const user = Keypair.generate();
  const userTokenAccount = await getOrCreateTokenAccount(
    connection, mint, user.publicKey, authority
  );
  
  await sdk.mintTokens(
    mint,
    authority,
    minter.publicKey,
    userTokenAccount,
    { amount: new BN(1_000_000) }
  );

  // 6. Add malicious user to blacklist
  const maliciousUser = Keypair.generate();
  await sdk.addToBlacklist(mint, blacklister, {
    user: maliciousUser.publicKey,
    reason: "Suspicious activity"
  });

  // 7. Seize tokens from blacklisted user
  const treasury = Keypair.generate();
  const treasuryAccount = await getOrCreateTokenAccount(
    connection, mint, treasury.publicKey, authority
  );
  
  await sdk.seize(mint, seizer, {
    sourceToken: userTokenAccount,
    destToken: treasuryAccount,
    amount: new BN(1_000_000)
  });

  console.log("Workflow completed successfully!");
}

completeWorkflow();
```

## License

ISC

## Support

For issues and questions, please visit the project repository.