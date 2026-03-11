# SSS-2: Compliant Stablecoin Standard

The SSS-2 specification defines a full-featured stablecoin with comprehensive compliance controls for regulated environments.

## Overview

SSS-2 is designed for regulated stablecoins requiring KYC/AML compliance, sanctions screening, and asset seizure capabilities.

### Use Cases

- **Regulated Stablecoins**: USD, EUR, or other fiat-backed tokens
- **Institutional Use**: Banks, fintechs, payment processors
- **KYC/AML Compliant Tokens**: Tokens requiring identity verification
- **Securities Tokenization**: Regulated asset tokenization

## Features

### Compliance Controls ✅

| Feature | Description | Enforcement |
|---------|-------------|-------------|
| Blacklist | Address-level blocking | On-chain (transfer hook) |
| Freeze/Thaw | Account-level freezing | On-chain (token-22) |
| Seizure | Token confiscation | On-chain (permanent delegate) |
| Transfer Hook | Pre-transfer validation | On-chain program |
| Default Frozen | Opt-in model | On-chain (token-22) |

### Core Features ✅

| Feature | Description |
|---------|-------------|
| Basic Mint/Burn | Standard token minting and burning |
| Multiple Minters | Support for multiple authorized minters |
| Minter Quotas | Per-minter minting limits |
| Authority Management | Transfer master authority |
| Role Management | Granular permission control |
| Pause/Unpause | Emergency stop functionality |

## Configuration

```typescript
import { Preset, PRESET_CONFIGS } from "@stbr/sss-token";

const config = PRESET_CONFIGS[Preset.SSS_2];
// {
//   enablePermanentDelegate: true,   // For seizure
//   enableTransferHook: true,        // For blacklist
//   defaultAccountFrozen: true,      // Opt-in model
// }
```

### Configuration Values

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `enablePermanentDelegate` | `true` | Enables token seizure capability |
| `enableTransferHook` | `true` | Enables blacklist enforcement on transfer |
| `defaultAccountFrozen` | `true` | New accounts frozen until KYC complete |

## Implementation

### Using SDK

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

// Create SSS-2 compliant stablecoin
const stable = await SolanaStablecoin.create(provider, {
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  uri: "https://example.com/rusd-metadata.json",
  decimals: 6,
});

// Set up compliance roles
await stable.authority.updateRoles(authority, {
  blacklister: blacklister.publicKey,
  pauser: pauser.publicKey,
  seizer: seizer.publicKey,
});
```

### Using CLI

```bash
# Initialize SSS-2 stablecoin
sss-token init --preset sss-2 --name "Regulated USD" --symbol "RUSD"

# Set up roles
sss-token roles update \
  --blacklister <BLACKLISTER_ADDRESS> \
  --pauser <PAUSER_ADDRESS> \
  --seizer <SEIZER_ADDRESS>
```

## Architecture

### On-Chain Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SSS-2 Architecture                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Config    │  │ Minter Info │  │  Blacklist  │  │ Transfer   │ │
│  │   Account   │  │  Accounts   │  │    PDAs     │  │   Hook     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                     Token Mint (Token-22)                        ││
│  │  • Permanent Delegate (seizer)                                   ││
│  │  • Transfer Hook (blacklist enforcement)                         ││
│  │  • Freeze Authority (account freezing)                           ││
│  │  • Default Account State: Frozen                                 ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Transfer Flow:                                                      │
│  1. Sender initiates transfer                                        │
│  2. Transfer hook checks blacklist                                   │
│  3. If either party blacklisted → REVERT                             │
│  4. Transfer executes                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Account Structure

```rust
// Config Account (SSS-2)
pub struct Config {
    pub mint: Pubkey,                // Token mint address
    pub master_authority: Pubkey,    // Master authority
    pub pauser: Pubkey,              // Pause authority
    pub blacklister: Pubkey,         // Blacklist authority
    pub seizer: Pubkey,              // Seizure authority
    pub paused: bool,                // Pause state
    pub name: String,                // Token name
    pub symbol: String,              // Token symbol
    pub uri: String,                 // Metadata URI
    pub transfer_hook_program: Pubkey, // Transfer hook program
    pub permanent_delegate: Pubkey,  // Permanent delegate (seizer)
}

// Blacklist Entry
pub struct BlacklistEntry {
    pub address: Pubkey,    // Blacklisted address
    pub reason: String,     // Reason for blacklisting
    pub timestamp: i64,     // When blacklisted
}
```

## Compliance Operations

### Blacklist Management

```bash
# Add to blacklist (blocks all transfers to/from)
sss-token blacklist add <ADDRESS> --reason "OFAC SDN list match"

# Check blacklist status
sss-token blacklist check <ADDRESS>

# Remove from blacklist (requires approval)
sss-token blacklist remove <ADDRESS>
```

**Transfer Hook Behavior:**
```
Transfer(from, to, amount):
  if isBlacklisted(from) OR isBlacklisted(to):
    REVERT("Blacklisted address")
  else:
    EXECUTE_TRANSFER()
```

### Freeze/Thaw Operations

```bash
# Freeze token account
sss-token freeze <TOKEN_ACCOUNT>

# Check frozen status
sss-token balance <TOKEN_ACCOUNT>
# Output: FROZEN

# Thaw token account
sss-token thaw <TOKEN_ACCOUNT>
```

**Use Cases:**
- Suspicious activity investigation
- Account verification pending
- Regulatory hold

### Seizure Operations

```bash
# Prerequisite: Account must be frozen
sss-token freeze <TOKEN_ACCOUNT>

# Seize tokens to treasury
sss-token seize <TOKEN_ACCOUNT> --to <TREASURY_ACCOUNT>

# Seize specific amount
sss-token seize <TOKEN_ACCOUNT> --amount 1000000 --to <TREASURY>
```

**Requirements:**
1. Legal documentation (court order, regulatory directive)
2. Account must be frozen first
3. Audit trail must be maintained

## KYC/Onboarding Flow

### Opt-In Model (Default Frozen)

```
┌─────────────────────────────────────────────────────────────┐
│                    KYC Onboarding Flow                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User creates token account                               │
│     └─► Account is FROZEN by default                         │
│                                                              │
│  2. User completes KYC                                       │
│     └─► Submit identity documents                            │
│     └─► Pass AML screening                                   │
│     └─► Sanctions check (OFAC, etc.)                         │
│                                                              │
│  3. Compliance approves                                      │
│     └─► Thaw token account                                   │
│                                                              │
│  4. User can now receive/transfer tokens                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```bash
# 1. User creates account (frozen by default)
# (User does this via wallet)

# 2. After KYC approval, thaw account
sss-token thaw <USER_TOKEN_ACCOUNT>

# 3. User can now transact
```

## Sanctions Screening

### OFAC Integration

```bash
# Bulk import OFAC updates
cat ofac_sdn_addresses.txt | while read address; do
  sss-token blacklist add "$address" --reason "OFAC SDN $(date +%Y-%m-%d)"
done
```

### Screening Checklist

- [ ] OFAC SDN List (Specially Designated Nationals)
- [ ] OFAC Consolidated Sanctions List
- [ ] EU Sanctions List
- [ ] UN Security Council Sanctions
- [ ] Local regulatory lists

## Audit Trail

### Required Logging

All compliance operations must be logged:

| Operation | Required Fields |
|-----------|-----------------|
| Blacklist Add | address, reason, operator, timestamp, source list |
| Blacklist Remove | address, approval_id, operator, timestamp |
| Freeze | account, reason, operator, timestamp |
| Thaw | account, approval_id, operator, timestamp |
| Seize | source, destination, amount, legal_order_id, operator, timestamp |

### Log Format

```json
{
  "event": "SEIZE",
  "source_account": "...",
  "destination_account": "...",
  "amount": 1000000,
  "legal_order_id": "COURT-2024-001",
  "operator": "compliance_officer@example.com",
  "transaction_signature": "...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Role Permissions

| Role | Blacklist | Freeze | Seize | Pause | Mint | Authority |
|------|-----------|--------|-------|-------|------|-----------|
| Master Authority | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Blacklister | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pauser | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Seizer | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Minter | ❌ | ❌ | ❌ | ❌ | ✅* | ❌ |

*Minter can only mint within quota

## Security Requirements

### Key Management

| Role | Storage | Access |
|------|---------|--------|
| Master Authority | HSM or Multi-sig (4-of-7) | Offline |
| Seizer | HSM or Multi-sig (3-of-5) | Offline |
| Blacklister | Hot wallet with rate limit | Online |
| Pauser | Hot wallet with rate limit | Online |
| Minter | Hot wallet with quota | Online |

### Multi-Signature Setup

```bash
# Create multi-sig for master authority
spl-token create-multisig 4 \
  <AUTHORITY_1> \
  <AUTHORITY_2> \
  <AUTHORITY_3> \
  <AUTHORITY_4> \
  <AUTHORITY_5> \
  <AUTHORITY_6> \
  <AUTHORITY_7>
```

## Comparison with SSS-1

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint/Burn | ✅ | ✅ |
| Multiple Minters | ✅ | ✅ |
| Pause | ✅ | ✅ |
| Blacklist | ❌ | ✅ (on-chain) |
| Freeze | ❌ | ✅ |
| Seize | ❌ | ✅ |
| Transfer Hook | ❌ | ✅ |
| Default Frozen | ❌ | ✅ |
| KYC Integration | ❌ | ✅ |
| Audit Trail | Optional | Required |
| Gas Cost | Lower | Higher |

## Testing

SSS-2 specific tests in the enhanced SDK test suite:

```bash
# Run enhanced SDK tests
cd sss-token && ./test-enhanced.sh

# SSS-2 specific tests:
# - Preset Configuration Tests (SSS_2)
# - Compliance API Tests (blacklist, freeze, thaw)
# - Seizure Operations Tests
# - Full Workflow Test
```

### Test Coverage

| Category | Tests |
|----------|-------|
| Preset Config | SSS_2 values verified |
| Blacklist | Add, remove, check, enforcement |
| Freeze/Thaw | Freeze, thaw, status check |
| Seizure | Seize from frozen account |
| Transfer Hook | Blacklist enforcement on transfer |

## Regulatory Considerations

### Jurisdiction Requirements

Different jurisdictions have varying requirements:

| Jurisdiction | KYC | AML | Sanctions | Seizure |
|--------------|-----|-----|-----------|---------|
| US (FinCEN) | Required | Required | OFAC | Court order |
| EU (MiCA) | Required | Required | EU list | Court order |
| Singapore | Required | Required | UN+Local | Court order |
| Switzerland | Required | Required | Swiss list | Court order |

### Compliance Checklist

- [ ] KYC/AML program established
- [ ] Sanctions screening process
- [ ] Compliance officer designated
- [ ] Audit trail implementation
- [ ] Legal review of seizure process
- [ ] Regulatory registration/licensing
- [ ] Regular compliance reporting

## References

- [SDK Documentation](./SDK.md)
- [SSS-1 Specification](./SSS-1.md)
- [Compliance Guide](./COMPLIANCE.md)
- [Operations Guide](./OPERATIONS.md)