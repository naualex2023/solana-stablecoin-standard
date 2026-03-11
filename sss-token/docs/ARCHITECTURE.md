# SSS Token Architecture

Detailed system architecture documentation covering the layer model, data flows, and security model.

## Table of Contents

- [Layer Model](#layer-model)
- [Component Overview](#component-overview)
- [Data Flows](#data-flows)
- [Security Model](#security-model)
- [Account Structure](#account-structure)
- [Program Instructions](#program-instructions)

## Layer Model

The SSS Token system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Layer 4: Application                              │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   Web Apps      │  │   Mobile Apps   │  │   Third-party Integrations  │ │
│  │   (Frontend)    │  │                 │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Layer 3: Services                                 │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  Admin CLI      │  │  TypeScript SDK │  │   Backend Microservices     │ │
│  │  (sss-token)    │  │  (@stbr/sss)    │  │   • Mint-Burn Service       │ │
│  │                 │  │                 │  │   • Compliance Service      │ │
│  │                 │  │                 │  │   • Webhook Service         │ │
│  │                 │  │                 │  │   • Indexer                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Layer 2: Program                                  │
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │     SSS Token Program       │  │      Transfer Hook Program          │  │
│  │                             │  │            (SSS-2 only)             │  │
│  │  Instructions:              │  │                                     │  │
│  │  • initialize               │  │  • Execute (transfer validation)    │  │
│  │  • mint / burn              │  │                                     │  │
│  │  • add_minter / remove      │  │                                     │  │
│  │  • pause / unpause          │  │                                     │  │
│  │  • blacklist_add / remove   │  │                                     │  │
│  │  • freeze / thaw            │  │                                     │  │
│  │  • seize                    │  │                                     │  │
│  │  • update_roles             │  │                                     │  │
│  │  • transfer_authority       │  │                                     │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Layer 1: Token                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Token-22 Mint (SPL Token 2022)                    │   │
│  │                                                                       │   │
│  │  Extensions:                                                          │   │
│  │  • Permanent Delegate (SSS-2) - Enables seizure                      │   │
│  │  • Transfer Hook (SSS-2) - Enables blacklist enforcement             │   │
│  │  • Freeze Authority - Enables account freezing                       │   │
│  │  • Default Account State (SSS-2) - Frozen by default                 │   │
│  │  • Metadata - Token name, symbol, URI                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Layer 0: Solana Runtime                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Solana Blockchain                               │   │
│  │  • Proof of Stake consensus                                         │   │
│  │  • Sealevel runtime (parallel execution)                            │   │
│  │  • Account model                                                    │   │
│  │  • Program execution environment                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Overview

### On-Chain Components

#### SSS Token Program

The main Anchor program managing stablecoin logic:

| Module | Instructions | Purpose |
|--------|--------------|---------|
| Initialize | `initialize` | Create new stablecoin config |
| Minting | `add_minter`, `remove_minter`, `update_quota`, `mint_tokens` | Manage minters and mint tokens |
| Burning | `burn_tokens` | Burn tokens from accounts |
| Pause | `pause`, `unpause` | Emergency controls |
| Compliance | `blacklist_add`, `blacklist_remove`, `freeze`, `thaw`, `seize` | Compliance operations |
| Authority | `update_roles`, `transfer_authority` | Role and authority management |

#### Transfer Hook Program (SSS-2)

Validates transfers against blacklist:

```
Transfer Flow (SSS-2):
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Sender  │────▶│ Transfer Hook│────▶│  Recipient   │
└──────────┘     │   Program    │     └──────────────┘
                 │              │
                 │ Check:       │
                 │ • Sender     │
                 │   blacklisted│
                 │ • Recipient  │
                 │   blacklisted│
                 │              │
                 │ If either:   │
                 │   REVERT     │
                 │ Else:        │
                 │   ALLOW      │
                 └──────────────┘
```

### Off-Chain Components

#### TypeScript SDK

```typescript
// SDK Structure
@stbr/sss-token
├── SSSTokenClient       // Low-level program client
├── SolanaStablecoin     // High-level namespaced API
├── Preset               // SSS-1, SSS-2 configurations
└── Types                // TypeScript definitions
```

#### Admin CLI

```
sss-token CLI Commands:
├── init              Initialize new stablecoin
├── mint              Mint tokens
├── burn              Burn tokens
├── freeze/thaw       Account freezing
├── pause/unpause     Emergency controls
├── blacklist         Blacklist management
├── seize             Token seizure
├── minters           Minter management
├── roles             Role management
└── config            CLI configuration
```

#### Frontend Web Application

The frontend provides a web UI for stablecoin management:

```
Frontend Architecture:
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 14 App Router                     │
├─────────────────────────────────────────────────────────────┤
│  Pages:                                                      │
│  • / (Dashboard) - Overview stats, recent activity          │
│  • /create - Create new stablecoin wizard                   │
│  • /admin - Admin operations (mint, burn, freeze, etc.)     │
│  • /holders - Token holder management                       │
├─────────────────────────────────────────────────────────────┤
│  Data Fetching Modes:                                        │
│  • RPC Mode - Direct blockchain queries (default)           │
│  • Indexer Mode - Backend API for aggregated data           │
├─────────────────────────────────────────────────────────────┤
│  Components:                                                 │
│  • WalletProvider - Solana wallet adapter                   │
│  • Navigation - App navigation bar                          │
│  • useStablecoins - React hook for data fetching            │
└─────────────────────────────────────────────────────────────┘
```

See [frontend/README.md](../frontend/README.md) for detailed documentation.

#### Backend Services

```
Backend Architecture:
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (Nginx)                     │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Mint-Burn     │    │ Compliance    │    │ Webhook       │
│ Service       │    │ Service       │    │ Service       │
│ :3001         │    │ :3002         │    │ :3003         │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌───────────────┐
                    │ Indexer       │
                    │ :3004         │
                    └───────────────┘
                              │
                              ▼
                    ┌───────────────┐
                    │ PostgreSQL    │
                    │ Redis         │
                    └───────────────┘
```

## Data Flows

### Mint Flow

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Operator│    │   SDK   │    │ Program │    │ Token-22│    │Recipient│
│         │    │         │    │         │    │  Mint   │    │ Account │
└────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘
     │              │              │              │              │
     │ 1. Request   │              │              │              │
     │   mint()     │              │              │              │
     │─────────────▶│              │              │              │
     │              │              │              │              │
     │              │ 2. Build TX  │              │              │
     │              │   with quota │              │              │
     │              │   check      │              │              │
     │              │─────────────▶│              │              │
     │              │              │              │              │
     │              │              │ 3. Mint to   │              │
     │              │              │   Token-22   │              │
     │              │              │─────────────▶│              │
     │              │              │              │              │
     │              │              │              │ 4. Credit    │
     │              │              │              │   tokens     │
     │              │              │              │─────────────▶│
     │              │              │              │              │
     │              │ 5. TX Sig    │              │              │
     │              │◀─────────────│              │              │
     │              │              │              │              │
     │ 6. Result    │              │              │              │
     │◀─────────────│              │              │              │
     │              │              │              │              │
```

### Transfer Flow (SSS-2)

```
┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌─────────┐
│  Sender │    │ Token-22│    │ Transfer    │    │Recipient│
│         │    │  Mint   │    │ Hook        │    │         │
└────┬────┘    └────┬────┘    └──────┬──────┘    └────┬────┘
     │              │                │                │
     │ 1. Transfer  │                │                │
     │─────────────▶│                │                │
     │              │                │                │
     │              │ 2. Invoke Hook │                │
     │              │───────────────▶│                │
     │              │                │                │
     │              │                │ 3. Check       │
     │              │                │   blacklist    │
     │              │                │                │
     │              │                │ 4. Result      │
     │              │◀───────────────│                │
     │              │                │                │
     │              │ 5. Execute/    │                │
     │              │   Revert       │                │
     │              │───────────────────────────────▶│
     │              │                │                │
```

### Compliance Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Compliance  │    │ Compliance  │    │ SSS Token   │    │  Token-22   │
│   Team      │    │  Service    │    │  Program    │    │    Mint     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │ 1. Blacklist     │                  │                  │
       │   request        │                  │                  │
       │─────────────────▶│                  │                  │
       │                  │                  │                  │
       │                  │ 2. Execute       │                  │
       │                  │   blacklist_add  │                  │
       │                  │─────────────────▶│                  │
       │                  │                  │                  │
       │                  │                  │ 3. Store PDA     │
       │                  │                  │                  │
       │                  │ 4. TX Signature  │                  │
       │                  │◀─────────────────│                  │
       │                  │                  │                  │
       │                  │ 5. Emit Event    │                  │
       │                  │◀─────────────────│                  │
       │                  │                  │                  │
       │ 6. Confirmation  │                  │                  │
       │◀─────────────────│                  │                  │
       │                  │                  │                  │
```

## Security Model

### Role-Based Access Control (RBAC)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Role Hierarchy                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                      ┌─────────────────────┐                            │
│                      │  Master Authority   │                            │
│                      │   (Highest Level)   │                            │
│                      │                     │                            │
│                      │  • All operations   │                            │
│                      │  • Role management  │                            │
│                      │  • Authority xfer   │                            │
│                      └──────────┬──────────┘                            │
│                                 │                                        │
│          ┌──────────────────────┼──────────────────────┐                │
│          │                      │                      │                │
│          ▼                      ▼                      ▼                │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐           │
│  │  Blacklister  │    │    Pauser     │    │    Seizer     │           │
│  │               │    │               │    │               │           │
│  │ • Blacklist   │    │ • Pause       │    │ • Freeze      │           │
│  │   add/remove  │    │ • Unpause     │    │ • Thaw        │           │
│  │               │    │               │    │ • Seize       │           │
│  └───────────────┘    └───────────────┘    └───────────────┘           │
│                                                                          │
│                                 │                                        │
│                                 ▼                                        │
│                        ┌───────────────┐                                 │
│                        │    Minter     │                                 │
│                        │               │                                 │
│                        │ • Mint tokens │                                 │
│                        │   (quota)     │                                 │
│                        └───────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Operation | Master Auth | Blacklister | Pauser | Seizer | Minter |
|-----------|:-----------:|:-----------:|:------:|:------:|:------:|
| Initialize | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add/Remove Minter | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update Quota | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mint Tokens | ❌ | ❌ | ❌ | ❌ | ✅* |
| Burn Tokens | ❌ | ❌ | ❌ | ❌ | Owner |
| Pause/Unpause | ✅ | ❌ | ✅ | ❌ | ❌ |
| Blacklist Add/Remove | ✅ | ✅ | ❌ | ❌ | ❌ |
| Freeze/Thaw | ✅ | ❌ | ❌ | ✅ | ❌ |
| Seize | ✅ | ❌ | ❌ | ✅ | ❌ |
| Update Roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer Authority | ✅ | ❌ | ❌ | ❌ | ❌ |

*Within quota limit

### Key Security Principles

#### 1. Least Privilege

Each role has minimum necessary permissions:
- Blacklister can only manage blacklist
- Pauser can only pause/unpause
- Seizer can only freeze/thaw/seize
- Minter can only mint within quota

#### 2. Separation of Duties

Critical operations require multiple roles:
- Seizure requires freeze (seizer) + legal approval
- Authority transfer requires multi-sig
- Large mints require quota allocation (master) + execution (minter)

#### 3. Defense in Depth

Multiple security layers:
```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: On-chain Program                                  │
│  • Role-based access control                                │
│  • Pause mechanism                                          │
│  • Quota enforcement                                        │
│                                                              │
│  Layer 2: Token Extensions                                  │
│  • Freeze authority                                         │
│  • Transfer hook (blacklist)                                │
│  • Permanent delegate (seizure)                             │
│                                                              │
│  Layer 3: Off-chain Services                                │
│  • API authentication (JWT)                                 │
│  • Rate limiting                                            │
│  • Audit logging                                            │
│                                                              │
│  Layer 4: Operational Security                              │
│  • Key management (HSM/multi-sig)                           │
│  • Access controls                                          │
│  • Monitoring & alerts                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Audit Trail

All operations are logged:
- Transaction signature
- Operator identity
- Timestamp
- Operation details

## Account Structure

### Config Account

```rust
pub struct Config {
    pub mint: Pubkey,                // Token-22 mint address
    pub master_authority: Pubkey,    // Master authority
    pub pauser: Pubkey,              // Pause authority
    pub blacklister: Pubkey,         // Blacklist authority
    pub seizer: Pubkey,              // Seizure authority
    pub paused: bool,                // Pause state
    pub name: String,                // Token name
    pub symbol: String,              // Token symbol
    pub uri: String,                 // Metadata URI
    pub transfer_hook_program: Option<Pubkey>,  // SSS-2 only
    pub permanent_delegate: Option<Pubkey>,     // SSS-2 only
}
```

### Minter Info Account

```rust
pub struct MinterInfo {
    pub authority: Pubkey,    // Minter's public key
    pub quota: u64,           // Maximum mintable amount
    pub minted: u64,          // Already minted amount
}
```

### Blacklist Entry (PDA)

```rust
pub struct BlacklistEntry {
    pub address: Pubkey,      // Blacklisted address
    pub reason: String,       // Reason for blacklisting
    pub timestamp: i64,       // Unix timestamp
}
```

## Program Instructions

### Instruction Overview

| Instruction | Parameters | Authority Required |
|-------------|------------|-------------------|
| `Initialize` | mint, name, symbol, uri, config | Payer |
| `AddMinter` | minter, quota | Master Authority |
| `RemoveMinter` | minter | Master Authority |
| `UpdateQuota` | minter, new_quota | Master Authority |
| `MintTokens` | recipient, amount | Minter + Mint Authority |
| `BurnTokens` | token_account, amount | Owner |
| `Pause` | - | Pauser |
| `Unpause` | - | Pauser |
| `BlacklistAdd` | address, reason | Blacklister |
| `BlacklistRemove` | address | Blacklister |
| `Freeze` | token_account | Seizer |
| `Thaw` | token_account | Seizer |
| `Seize` | source, destination, amount | Seizer |
| `UpdateRoles` | blacklister?, pauser?, seizer? | Master Authority |
| `TransferAuthority` | new_authority | Master Authority |

### Error Codes

| Code | Description |
|------|-------------|
| `Unauthorized` | Signer does not have required authority |
| `Paused` | Stablecoin is paused |
| `QuotaExceeded` | Minter quota exceeded |
| `AlreadyBlacklisted` | Address already blacklisted |
| `NotBlacklisted` | Address not in blacklist |
| `AccountFrozen` | Token account is frozen |
| `AccountNotFrozen` | Token account is not frozen |
| `InvalidMint` | Invalid mint address |
| `InvalidAmount` | Invalid amount (zero or overflow) |

## References

- [SDK Documentation](./SDK.md)
- [SSS-1 Specification](./SSS-1.md)
- [SSS-2 Specification](./SSS-2.md)
- [Operations Guide](./OPERATIONS.md)