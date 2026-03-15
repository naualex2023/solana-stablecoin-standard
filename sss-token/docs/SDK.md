# SSS Token SDK Documentation

Complete guide to the `@stbr/sss-token` TypeScript SDK for building Solana stablecoins.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Presets](#presets)
- [Custom Configurations](#custom-configurations)
- [Namespaced API Reference](#namespaced-api-reference)
- [Examples](#examples)
- [Testing](#testing)

## Installation

```bash
npm install @stbr/sss-token
# or
pnpm add @stbr/sss-token
# or
yarn add @stbr/sss-token
```

### Prerequisites

- Node.js 18+
- Solana CLI tools
- Anchor framework

## Quick Start

### Connect to Existing Stablecoin

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// Setup provider
const connection = new Connection("https://api.devnet.solana.com");
const wallet = new Wallet(keypair);
const provider = new AnchorProvider(connection, wallet);

// Connect to existing stablecoin
const stable = await SolanaStablecoin.connect(provider, {
  mint: new PublicKey("..."),
});

// Use namespaced APIs
const config = await stable.getConfig();
console.log(`Connected to: ${config.name} (${config.symbol})`);
```

### Create New Stablecoin

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// Create SSS-2 compliant stablecoin
const stable = await SolanaStablecoin.create(provider, {
  preset: Preset.SSS_2,
  name: "My USD Stablecoin",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});
```

## Presets

The SDK provides two preset configurations for different use cases:

### SSS-1: Minimal Stablecoin

Basic stablecoin with mint/burn functionality, no compliance features.

```typescript
import { Preset, PRESET_CONFIGS } from "@stbr/sss-token";

// Configuration
const config = PRESET_CONFIGS[Preset.SSS_1];
// {
//   enablePermanentDelegate: false,
//   enableTransferHook: false,
//   defaultAccountFrozen: false,
// }
```

**Use Cases:**
- Internal testing
- Non-regulated environments
- Simple tokenized assets

**Features:**
- ✅ Basic mint/burn
- ✅ Multiple minters with quotas
- ✅ Authority management
- ❌ No blacklist
- ❌ No freeze/seize
- ❌ No transfer hooks

### SSS-2: Compliant Stablecoin

Full-featured stablecoin with compliance controls.

```typescript
import { Preset, PRESET_CONFIGS } from "@stbr/sss-token";

const config = PRESET_CONFIGS[Preset.SSS_2];
// {
//   enablePermanentDelegate: true,
//   enableTransferHook: true,
//   defaultAccountFrozen: true,
// }
```

**Use Cases:**
- Regulated stablecoins
- Institutional use
- KYC/AML compliant tokens

**Features:**
- ✅ Basic mint/burn
- ✅ Multiple minters with quotas
- ✅ Authority management
- ✅ Blacklist (sanctions screening)
- ✅ Freeze/seize capabilities
- ✅ Transfer hooks for compliance
- ✅ Default account frozen (opt-in model)

## Custom Configurations

Override preset defaults or create custom configurations:

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// Override specific preset options
const stable = await SolanaStablecoin.create(provider, {
  preset: Preset.SSS_2,
  name: "Custom USD",
  symbol: "CUSD",
  uri: "https://example.com/cusd.json",
  decimals: 9, // Override default 6 decimals
  overrideConfig: {
    defaultAccountFrozen: false, // Override SSS-2 default
  },
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enablePermanentDelegate` | boolean | false | Enable seize capability |
| `enableTransferHook` | boolean | false | Enable blacklist enforcement |
| `defaultAccountFrozen` | boolean | false | New accounts frozen by default |

## Namespaced API Reference

The `SolanaStablecoin` class provides organized, namespaced APIs:

### Compliance API

```typescript
stable.compliance.blacklistAdd(blacklister, user, reason)
stable.compliance.blacklistRemove(blacklister, user)
stable.compliance.isBlacklisted(user)
stable.compliance.getBlacklistEntry(user)
stable.compliance.freeze(tokenAccount, freezeAuthority)
stable.compliance.thaw(tokenAccount, freezeAuthority)
stable.compliance.seize(seizer, sourceToken, destToken, amount)
```

#### Blacklist Operations

```typescript
// Add to blacklist
const tx = await stable.compliance.blacklistAdd(
  blacklister,      // Signer with blacklister role
  userPublicKey,    // Address to blacklist
  "Sanctioned address"  // Reason
);
await connection.confirmTransaction(tx);

// Check blacklist status
const isBlacklisted = await stable.compliance.isBlacklisted(userPublicKey);

// Get blacklist entry details
const entry = await stable.compliance.getBlacklistEntry(userPublicKey);
console.log(entry.reason);  // "Sanctioned address"
console.log(entry.timestamp);  // Unix timestamp

// Remove from blacklist
await stable.compliance.blacklistRemove(blacklister, userPublicKey);
```

#### Freeze/Thaw Operations

There are two types of freeze/thaw operations depending on how the mint was configured:

**Regular Freeze/Thaw (Keypair Authority)**
For mints where the freeze authority is a regular keypair:
```typescript
// Freeze token account
await stable.compliance.freeze(tokenAccount, freezeAuthority);

// Thaw token account
await stable.compliance.thaw(tokenAccount, freezeAuthority);
```

**PDA-Based Freeze (For Seize Operations)**
For mints with PDA-based freeze authority (used for seize capability):
```typescript
// Freeze using PDA authority - seizer must be authorized in config
await stable.compliance.freezePda(mint, tokenAccount, seizer);

// Thaw is handled automatically during seize operation
```

**Check Frozen Status**
```typescript
// Check if frozen
const accountInfo = await getAccount(connection, tokenAccount);
console.log(accountInfo.isFrozen);  // true
```

#### Seizure Operations

```typescript
// Seize tokens from frozen account
await stable.compliance.seize(
  seizer,           // Signer with seizer role
  sourceToken,      // Frozen token account
  treasuryToken,    // Destination account
  new BN(1_000_000) // Amount to seize
);
```

### Minting API

```typescript
stable.minting.addMinter(masterAuthority, minter, quota)
stable.minting.updateQuota(masterAuthority, minter, newQuota)
stable.minting.removeMinter(masterAuthority, minter)
stable.minting.getMinterInfo(minter)
stable.minting.mintTokens(mintAuthority, minter, tokenAccount, amount)
```

#### Minter Management

```typescript
// Add minter with quota
await stable.minting.addMinter(
  authority,
  minterPublicKey,
  new BN(1_000_000_000)  // 1000 tokens (6 decimals)
);

// Get minter info
const minterInfo = await stable.minting.getMinterInfo(minterPublicKey);
console.log(minterInfo.quota);    // Max mintable
console.log(minterInfo.minted);   // Already minted

// Update quota
await stable.minting.updateQuota(authority, minterPublicKey, new BN(2_000_000_000));

// Remove minter (sets quota to 0)
await stable.minting.removeMinter(authority, minterPublicKey);
```

#### Minting Tokens

```typescript
// Mint tokens
await stable.minting.mintTokens(
  authority,           // Mint authority signer
  minterPublicKey,     // For quota tracking
  recipientTokenAccount,
  new BN(100_000)      // Amount
);
```

### Burning API

```typescript
stable.burning.burn(tokenAccount, burner, amount)
```

```typescript
// Burn tokens
await stable.burning.burn(
  tokenAccount,
  owner,              // Must own the token account
  new BN(50_000)
);
```

### Pause API

```typescript
stable.pause.pause(pauser)
stable.pause.unpause(pauser)
stable.pause.isPaused()
```

```typescript
// Pause all operations
await stable.pause.pause(pauser);

// Check pause status
const isPaused = await stable.pause.isPaused();

// Unpause
await stable.pause.unpause(pauser);
```

### Authority API

```typescript
stable.authority.transfer(masterAuthority, newMasterAuthority)
stable.authority.updateRoles(masterAuthority, roles)
```

```typescript
// Transfer master authority
await stable.authority.transfer(
  currentAuthority,
  newAuthorityPublicKey
);

// Update compliance roles
await stable.authority.updateRoles(authority, {
  blacklister: newBlacklisterPublicKey,
  pauser: newPauserPublicKey,
  seizer: newSeizerPublicKey,
});
```

## Examples

### Full Workflow Example

```typescript
import {
  SolanaStablecoin,
  Preset,
  SSSTokenClient,
} from "@stbr/sss-token";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";

async function main() {
  // Setup
  const connection = new Connection("http://localhost:8899", "confirmed");
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet);

  // Create stablecoin
  const stable = await SolanaStablecoin.create(provider, {
    preset: Preset.SSS_2,
    name: "My USD",
    symbol: "MYUSD",
    uri: "https://example.com/metadata.json",
  });

  // Setup roles
  await stable.authority.updateRoles(wallet, {
    blacklister: blacklister.publicKey,
    pauser: pauser.publicKey,
    seizer: seizer.publicKey,
  });

  // Add minter
  await stable.minting.addMinter(wallet, minter.publicKey, new BN(1_000_000_000));

  // Create token account for user
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    stable.mint,
    user.publicKey,
    undefined,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  // Mint tokens
  await stable.minting.mintTokens(
    wallet,
    minter.publicKey,
    userTokenAccount.address,
    new BN(1_000_000)
  );

  // Blacklist malicious user
  await stable.compliance.blacklistAdd(
    blacklister,
    maliciousUser.publicKey,
    "Sanctioned"
  );

  // Emergency pause
  await stable.pause.pause(pauser);

  // Resume operations
  await stable.pause.unpause(pauser);
}
```

### Using with Existing Client

```typescript
// If you already have an SSSTokenClient
const client = new SSSTokenClient({ provider });
await client.initialize(mint, authority, { ... });

// Wrap with enhanced SDK
const stable = SolanaStablecoin.fromClient(client, mint);

// Now use namespaced APIs
await stable.compliance.blacklistAdd(...);
```

## Testing

### Test Commands

The project provides multiple ways to run tests:

#### Rust Unit Tests (via Cargo)

```bash
# Run all sss-token program tests (44 tests)
cd sss-token
cargo test --package sss-token --test sss_token

# Run all transfer-hook program tests (26 tests)
cargo test --package transfer-hook --test transfer_hook

# Run all Rust tests for both programs (70 tests total)
cargo test --package sss-token --package transfer-hook
```

#### SDK Integration Tests (via test scripts)

```bash
# Basic SDK tests - validates core SDK functionality (38 tests)
./test.sh

# Enhanced SDK tests - validates namespaced API and presets (44 tests)
./test-enhanced.sh

# Run both SDK test suites
./test.sh && ./test-enhanced.sh
```

#### Test Script Options

Both `test.sh` and `test-enhanced.sh` support the following options:

| Option | Description |
|--------|-------------|
| `--clean` | Clean ledger and start fresh validator |
| `--skip-deploy` | Skip program deployment (reuse existing) |
| `--no-stop` | Keep validator running after tests |
| `--help` | Show help message |

**Examples:**
```bash
# Fresh start with clean ledger
./test.sh --clean

# Reuse existing deployment, keep validator running
./test-enhanced.sh --skip-deploy --no-stop

# Run specific test file (enhanced script only)
./test-enhanced.sh --file tests/sdk-enhanced.test.ts
```

### Test Files

| File | Tests | Description |
|------|-------|-------------|
| `sdk.test.ts` | 38 | Core SSSTokenClient tests (15 positive, 23 negative) |
| `sdk-enhanced.test.ts` | 44 | SolanaStablecoin namespaced API tests (23 positive, 21 negative) |
| `programs/sss-token/tests/sss_token.rs` | 44 | Rust unit tests (14 positive, 30 negative) |
| `programs/transfer-hook/tests/transfer_hook.rs` | 26 | Rust unit tests (8 positive, 18 negative) |

**Total: 152 tests (60 positive, 92 negative)**

### Test Coverage Summary

#### SDK Basic Tests (sdk.test.ts)

**Positive Tests (15):**
- Initialization, minter management, pause/unpause
- Authority management, token operations
- Compliance (blacklist, freeze/thaw, seize)
- Full workflow

**Negative Tests (23):**
- Initialization validation (name, symbol, URI length)
- Unauthorized operations (pause, minter management, authority)
- Blacklist validation (unauthorized, reason length)
- Minting/burning validation (paused, quota, balance)
- Freeze/thaw/seize authorization

#### SDK Enhanced Tests (sdk-enhanced.test.ts)

**Positive Tests (23):**
- Preset configuration (SSS_1, SSS_2)
- SolanaStablecoin.connect() and namespaced APIs
- Compliance API (blacklist, freeze, thaw)
- Minting API (add/remove minters, quota, mint)
- Burning API, Pause API, Authority API
- Full workflow with PDA authority

**Negative Tests (21):**
- Compliance API (unauthorized, reason too long)
- Minting API (unauthorized, quota exceeded)
- Pause/Authority API (unauthorized)
- Burning API (insufficient balance)
- Connection (non-existent stablecoin)

### Debugging Failed Tests

```bash
# Check validator logs
cat test-logs/validator.log

# Run tests verbose (Rust)
cargo test --package sss-token -- --nocapture

# Run tests verbose (SDK)
npx ts-mocha tests/sdk.test.ts --timeout 100000 --reporter spec
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Validator won't start | Kill existing: `pkill -f solana-test-validator` |
| Insufficient balance | Run with `--clean` to get fresh airdrop |
| Program not found | Remove `--skip-deploy` to rebuild |
| Timeout errors | Increase mocha timeout: `--timeout 200000` |

For complete test documentation, see [TESTS.md](../TESTS.md).

## Error Handling

```typescript
try {
  await stable.minting.mintTokens(authority, minter, tokenAccount, amount);
} catch (error) {
  if (error.message.includes("QuotaExceeded")) {
    console.error("Minter quota exceeded");
  } else if (error.message.includes("Paused")) {
    console.error("Stablecoin is paused");
  } else {
    throw error;
  }
}
```

## Type Definitions

```typescript
import {
  Preset,
  PresetConfig,
  StablecoinConfig,
  MinterInfo,
  BlacklistEntry,
  InitializeParams,
} from "@stbr/sss-token";

// Preset enum
const preset: Preset = Preset.SSS_2;

// Preset configuration
const config: PresetConfig = PRESET_CONFIGS[preset];

// Stablecoin config (from chain)
const stableConfig: StablecoinConfig = await stable.getConfig();

// Minter info
const minterInfo: MinterInfo = await stable.minting.getMinterInfo(minter);

// Blacklist entry
const entry: BlacklistEntry = await stable.compliance.getBlacklistEntry(user);
```

## See Also

- [SSS-1 Specification](./SSS-1.md) - Minimal stablecoin standard
- [SSS-2 Specification](./SSS-2.md) - Compliant stablecoin standard
- [Operations Guide](./OPERATIONS.md) - Operator runbook
- [Compliance Guide](./COMPLIANCE.md) - Regulatory considerations