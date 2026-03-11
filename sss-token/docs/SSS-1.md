# SSS-1: Minimal Stablecoin Standard

The SSS-1 specification defines a minimal, lightweight stablecoin implementation for non-regulated use cases.

## Overview

SSS-1 is designed for simplicity and efficiency, providing basic stablecoin functionality without compliance overhead.

### Use Cases

- **Internal Testing**: Development and testing environments
- **Non-Regulated Environments**: Jurisdictions without regulatory requirements
- **Simple Tokenized Assets**: Basic asset tokenization without compliance needs
- **Micro-transactions**: High-throughput, low-cost token operations

## Features

### Included ✅

| Feature | Description |
|---------|-------------|
| Basic Mint/Burn | Standard token minting and burning |
| Multiple Minters | Support for multiple authorized minters |
| Minter Quotas | Per-minter minting limits |
| Authority Management | Transfer master authority |
| Role Management | Assign blacklister, pauser, seizer roles |
| Pause/Unpause | Emergency stop functionality |

### Excluded ❌

| Feature | Reason |
|---------|--------|
| Blacklist | Not needed for minimal use cases |
| Freeze/Thaw | Not needed for minimal use cases |
| Seizure | Not needed for minimal use cases |
| Transfer Hook | No compliance enforcement needed |
| Permanent Delegate | No seizure capability needed |
| Default Account Frozen | Opt-out model (accounts active by default) |

## Configuration

```typescript
import { Preset, PRESET_CONFIGS } from "@stbr/sss-token";

const config = PRESET_CONFIGS[Preset.SSS_1];
// {
//   enablePermanentDelegate: false,
//   enableTransferHook: false,
//   defaultAccountFrozen: false,
// }
```

### Configuration Values

| Parameter | Value | Description |
|-----------|-------|-------------|
| `enablePermanentDelegate` | `false` | No permanent delegate for seizure |
| `enableTransferHook` | `false` | No transfer hook for blacklist |
| `defaultAccountFrozen` | `false` | New accounts are active by default |

## Implementation

### Using SDK

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// Create SSS-1 stablecoin
const stable = await SolanaStablecoin.create(provider, {
  preset: Preset.SSS_1,
  name: "Simple Token",
  symbol: "SMPL",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});
```

### Using CLI

```bash
# Initialize SSS-1 stablecoin
sss-token init --preset sss-1 --name "Simple Token" --symbol "SMPL"
```

## Architecture

### On-Chain Components

```
┌─────────────────────────────────────────────────────────────┐
│                     SSS-1 Architecture                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Config    │    │ Minter Info │    │ Token Mint  │     │
│  │   Account   │    │  Accounts   │    │  (Token-22) │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                              │
│  Features:                                                   │
│  • Master Authority                                          │
│  • Pauser Role                                               │
│  • Minter Quotas                                             │
│  • Pause State                                               │
│                                                              │
│  NOT Included:                                               │
│  • Blacklist PDA                                             │
│  • Transfer Hook Program                                     │
│  • Permanent Delegate                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Account Structure

```rust
// Config Account (SSS-1)
pub struct Config {
    pub mint: Pubkey,              // Token mint address
    pub master_authority: Pubkey,  // Master authority
    pub pauser: Pubkey,            // Pause authority
    pub blacklister: Pubkey,       // Assigned but not enforced on-chain
    pub seizer: Pubkey,            // Assigned but not enforced on-chain
    pub paused: bool,              // Pause state
    pub name: String,              // Token name
    pub symbol: String,            // Token symbol
    pub uri: String,               // Metadata URI
    // No transfer_hook_program
    // No permanent_delegate
}

// Minter Info Account
pub struct MinterInfo {
    pub authority: Pubkey,  // Minter's public key
    pub quota: u64,         // Maximum mintable amount
    pub minted: u64,        // Already minted amount
}
```

## Operations

### Minting

```bash
# Add minter
sss-token minters add <ADDRESS> --quota 1000000000

# Mint tokens
sss-token mint <RECIPIENT> 1000000

# Check minter status
sss-token minters info <ADDRESS>
```

### Burning

```bash
# Burn tokens
sss-token burn 500000
```

### Pause

```bash
# Pause operations
sss-token pause

# Resume operations
sss-token unpause
```

### Authority

```bash
# Transfer master authority
sss-token transfer-authority <NEW_AUTHORITY>

# Update roles
sss-token roles update --pauser <ADDRESS>
```

## Gas Costs

SSS-1 has lower gas costs compared to SSS-2 due to reduced functionality:

| Operation | SSS-1 | SSS-2 |
|-----------|-------|-------|
| Initialize | ~0.005 SOL | ~0.008 SOL |
| Mint | ~0.0005 SOL | ~0.0005 SOL |
| Transfer | ~0.0003 SOL | ~0.0005 SOL |
| Pause | ~0.0003 SOL | ~0.0003 SOL |

## Security Considerations

### No Compliance Enforcement

⚠️ **Warning**: SSS-1 does NOT enforce compliance on-chain:
- Blacklist is not enforced during transfers
- Accounts cannot be frozen
- Tokens cannot be seized

### Recommended Safeguards

1. **Off-chain Monitoring**: Monitor transactions for suspicious activity
2. **Legal Framework**: Ensure legal agreements cover token holder obligations
3. **Emergency Pause**: Keep pause capability available for incidents
4. **Authority Security**: Secure master authority with multi-sig or HSM

## Comparison with SSS-2

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint/Burn | ✅ | ✅ |
| Multiple Minters | ✅ | ✅ |
| Minter Quotas | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ |
| Authority Transfer | ✅ | ✅ |
| Blacklist | ❌ | ✅ |
| Freeze/Thaw | ❌ | ✅ |
| Seizure | ❌ | ✅ |
| Transfer Hook | ❌ | ✅ |
| Default Frozen | ❌ | ✅ |
| Gas Cost | Lower | Higher |
| Complexity | Simple | Complex |

## When to Use SSS-1

### Suitable For ✅

- Development and testing
- Internal company tokens
- Loyalty points systems
- Non-regulated jurisdictions
- Simple asset tokenization
- High-frequency micro-transactions

### Not Suitable For ❌

- Regulated stablecoins
- Institutional use
- KYC/AML required environments
- High-value transfers
- Public DeFi integrations

## Migration to SSS-2

If compliance needs arise, migrate to SSS-2:

1. **Deploy new SSS-2 stablecoin**
2. **Set up compliance roles**
3. **Migrate token holders** (burn from SSS-1, mint to SSS-2)
4. **Update integrations**
5. **Deprecate SSS-1**

Note: Direct upgrade from SSS-1 to SSS-2 is not possible due to different token configurations.

## Testing

SSS-1 functionality is tested in the SDK test suite:

```bash
# Run SDK tests
cd sss-token/sdk && pnpm test

# Specific SSS-1 tests
# - test_initialize_sss1_minimal_stablecoin
# - test_add_minter
# - test_mint_tokens
# - test_burn_tokens
# - test_pause_and_unpause
# - test_transfer_authority
```

## References

- [SDK Documentation](./SDK.md)
- [SSS-2 Specification](./SSS-2.md)
- [Operations Guide](./OPERATIONS.md)