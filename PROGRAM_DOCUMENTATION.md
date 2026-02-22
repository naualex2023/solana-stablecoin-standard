# Solana Stablecoin Standard (SSS) - Anchor Program Documentation

## Overview

The Solana Stablecoin Standard (SSS) is a modular Anchor-based program that implements two standard presets for stablecoins using Token-2022 extensions:

- **SSS-1 (Minimal Stablecoin)**: Basic mint authority + freeze authority + metadata
- **SSS-2 (Compliant Stablecoin)**: SSS-1 + permanent delegate + transfer hook + blacklist enforcement

This documentation covers the complete technical implementation, including account structures, instructions, and PDA (Program Derived Address) logic.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Account Structures](#account-structures)
3. [PDA Logic](#pda-logic)
4. [Instructions](#instructions)
5. [Security & RBAC](#security--rbac)
6. [Transfer Hook Program](#transfer-hook-program)
7. [Usage Examples](#usage-examples)
8. [References](#references)

---

## Architecture Overview

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Standard Presets                              │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │ SSS-1 (Minimal) │  │ SSS-2 (Compliant)          │   │
│  │ - Basic mint   │  │ - Blacklist enforcement     │   │
│  │ - Freeze auth  │  │ - Seize capability          │   │
│  └─────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Modules                                       │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ Compliance      │  │ Privacy (Future)           │  │
│  │ - Blacklist      │  │ - Confidential transfers   │  │
│  │ - Transfer hook  │  │ - Scoped allowlists         │  │
│  └──────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ▲
                        │
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Base SDK                                       │
│  - Token creation with Token-2022 extensions             │
│  - Role management (RBAC)                                │
│  - Core operations (mint, burn, freeze, thaw)           │
└─────────────────────────────────────────────────────────┘
```

### Key Components

1. **Main Program** (`sss-token`): Core stablecoin operations
2. **Transfer Hook Program** (`transfer-hook`): Compliance validation for SSS-2
3. **Token-2022 Extensions**: Metadata, Permanent Delegate, Transfer Hook

---

## Account Structures

### 1. StablecoinConfig

**Purpose**: Main configuration account that defines the stablecoin's behavior and roles.

**PDA Seeds**: `["config", mint.key()]`

**Fields**:
```rust
pub struct StablecoinConfig {
    pub master_authority: Pubkey,    // Main administrative key
    pub mint: Pubkey,                // Token mint account
    pub name: String,                // Token name (max 100 chars)
    pub symbol: String,              // Token symbol (max 10 chars)
    pub uri: String,                 // Metadata URI (max 200 chars)
    pub decimals: u8,                // Decimal places
    pub paused: bool,                // Global pause flag
    pub bump: u8,                    // PDA bump
    
    // Module flags
    pub enable_permanent_delegate: bool,  // For SSS-2 seize capability
    pub enable_transfer_hook: bool,       // For SSS-2 blacklist enforcement
    pub default_account_frozen: bool,    // Default freeze state
    
    // Roles (RBAC)
    pub blacklister: Pubkey,         // Can add/remove from blacklist
    pub pauser: Pubkey,              // Can pause/unpause operations
    pub seizer: Pubkey,              // Can seize tokens (SSS-2)
}
```

**Size**: 387 bytes

**Usage**: This account is the single source of truth for the stablecoin's configuration. All instructions reference it to validate permissions and check module flags.

---

### 2. MinterInfo

**Purpose**: Tracks minter quotas and minted amounts for individual minters.

**PDA Seeds**: `["minter", config.key(), minter_authority.key()]`

**Fields**:
```rust
pub struct MinterInfo {
    pub authority: Pubkey,    // Minter's public key
    pub quota: u64,           // Maximum amount allowed to mint
    pub minted: u64,          // Total amount already minted
    pub bump: u8,             // PDA bump
}
```

**Size**: 57 bytes

**Usage**: Each authorized minter has a `MinterInfo` account. Before minting, the program verifies that `minted + amount <= quota`. This enables fine-grained control over token supply distribution.

**Example**:
```rust
// Minter with 1M token quota
quota: 1_000_000
minted: 500_000
// Can mint up to 500,000 more tokens
```

---

### 3. BlacklistEntry

**Purpose**: Marks addresses as blacklisted for SSS-2 compliance.

**PDA Seeds**: `["blacklist", config.key(), user_address.key()]`

**Fields**:
```rust
pub struct BlacklistEntry {
    pub user: Pubkey,        // Blacklisted address
    pub reason: String,      // Reason for blacklisting (max 100 chars)
    pub timestamp: i64,      // Unix timestamp when blacklisted
    pub bump: u8,            // PDA bump
}
```

**Size**: 145 bytes

**Usage**: When a user is blacklisted, a `BlacklistEntry` account is created. The transfer hook program checks for the existence of these accounts during every transfer to enforce compliance.

**Example**:
```rust
user: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
reason: "OFAC SDN List match"
timestamp: 1707897600
```

---

### 4. TransferHookData

**Purpose**: Stores transfer hook configuration for the SSS-2 compliance module.

**PDA Seeds**: `["transfer_hook", mint.key()]`

**Fields**:
```rust
pub struct TransferHookData {
    pub stablecoin_program: Pubkey,  // Reference to main program
    pub mint: Pubkey,                // Associated mint
    pub authority: Pubkey,           // Transfer hook authority
    pub paused: bool,                // Pause transfer validation
    pub bump: u8,                    // PDA bump
}
```

**Size**: 106 bytes

**Usage**: This account is created when initializing SSS-2 with transfer hooks enabled. The Token-2022 program calls the transfer hook instruction for every transfer, which references this account to validate the transfer.

---

## PDA Logic

### What are PDAs?

Program Derived Addresses are deterministic addresses derived from:
- A program ID
- A set of seeds (byte arrays)
- An optional bump (nonce)

PDAs are guaranteed to be unique to the program and don't require a private key to sign transactions. This makes them perfect for program-owned accounts.

### PDA Derivation in SSS

#### 1. Config PDA

```rust
seeds = [b"config", mint.key()]
bump = ctx.bumps.config
```

**Example**:
```rust
// Derive config address
let (config_pda, bump) = Pubkey::find_program_address(
    &[b"config", mint.key().as_ref()],
    program_id
);
```

**Purpose**: Ensures one unique config per mint. Prevents accidental creation of multiple configs for the same token.

---

#### 2. MinterInfo PDA

```rust
seeds = [b"minter", config.key(), minter_authority.key()]
bump = ctx.bumps.minter_info
```

**Example**:
```rust
// Derive minter info address
let (minter_info_pda, bump) = Pubkey::find_program_address(
    &[
        b"minter",
        config.key().as_ref(),
        minter_authority.key().as_ref(),
    ],
    program_id
);
```

**Purpose**: Enables one minter info account per authorized minter per stablecoin. The config key ensures the minter is specific to this stablecoin.

---

#### 3. BlacklistEntry PDA

```rust
seeds = [b"blacklist", config.key(), user_address.key()]
bump = ctx.bumps.blacklist_entry
```

**Example**:
```rust
// Derive blacklist entry address
let (blacklist_pda, bump) = Pubkey::find_program_address(
    &[
        b"blacklist",
        config.key().as_ref(),
        user_address.key().as_ref(),
    ],
    program_id
);
```

**Purpose**: Creates a deterministic address for each blacklisted user. The transfer hook can efficiently check if a blacklist entry exists by attempting to derive this PDA.

---

#### 4. TransferHookData PDA

```rust
seeds = [b"transfer_hook", mint.key()]
bump = ctx.bumps.hook_data
```

**Example**:
```rust
// Derive transfer hook data address
let (hook_data_pda, bump) = Pubkey::find_program_address(
    &[b"transfer_hook", mint.key().as_ref()],
    program_id
);
```

**Purpose**: Links the transfer hook to a specific mint, ensuring that the transfer hook is only called for that token.

---

### PDA in Action: Blacklist Check

The transfer hook program uses PDAs to efficiently check blacklist status:

```rust
pub fn execute(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
    let hook_data = &ctx.accounts.hook_data;
    let sender = &ctx.accounts.source_token.owner;
    let recipient = &ctx.accounts.dest_token.owner;

    // Derive blacklist PDA for sender
    // The account is provided in the transaction
    let sender_blacklist_info = &ctx.accounts.sender_blacklist;

    // If blacklist account exists (has data), reject transfer
    if sender_blacklist_info.data.borrow().len() > 0 {
        return Err(TransferHookError::SenderBlacklisted.into());
    }

    // Same check for recipient...
    // ...
}
```

The transfer hook uses the same seed pattern as the main program to derive blacklist PDAs, enabling cross-program PDA validation.

---

## Instructions

### Core Instructions (All Presets)

#### 1. Initialize

**Purpose**: Create a new stablecoin with specified configuration.

**Parameters**:
- `name: String` - Token name (max 100 chars)
- `symbol: String` - Token symbol (max 10 chars)
- `uri: String` - Metadata URI (max 200 chars)
- `decimals: u8` - Decimal places (typically 6-9)
- `enable_permanent_delegate: bool` - Enable seizure capability (SSS-2)
- `enable_transfer_hook: bool` - Enable blacklist enforcement (SSS-2)
- `default_account_frozen: bool` - Default freeze state for new accounts

**Accounts**:
```rust
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [b"config", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = decimals,
        mint::authority = authority,
        mint::freeze_authority = authority,
        extensions::metadata::name = name,
        extensions::metadata::symbol = symbol,
        extensions::metadata::uri = uri,
    )]
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token_2022::Token2022>,
}
```

**Example Usage (SSS-1)**:
```typescript
await program.methods
  .initialize(
    "My Stablecoin",
    "MYUSD",
    "https://example.com/metadata.json",
    6,  // 6 decimals (USDC-like)
    false,  // No permanent delegate
    false,  // No transfer hook
    false   // Not frozen by default
  )
  .accounts({
    config: configPDA,
    mint: mintKeypair.publicKey,
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([authority, mintKeypair])
  .rpc();
```

**Example Usage (SSS-2)**:
```typescript
await program.methods
  .initialize(
    "Compliant Stablecoin",
    "CUSD",
    "https://example.com/metadata.json",
    6,
    true,   // Enable permanent delegate
    true,   // Enable transfer hook
    false   // Not frozen by default
  )
  // ... same accounts
  .rpc();
```

---

#### 2. Mint

**Purpose**: Issue new tokens to a recipient's token account.

**Parameters**:
- `amount: u64` - Amount of tokens to mint (in smallest unit)

**Accounts**:
```rust
pub struct Mint<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    #[account(mut)]
    pub minter: Signer<'info>,
    
    #[account(mut)]
    pub token_account: Account<'info, token_2022::TokenAccount>,
    
    pub token_program: Program<'info, token_2022::Token2022>,
}
```

**Validation**:
- Checks if token is paused
- Verifies minter quota: `minted + amount <= quota`
- Updates `minted` counter

**Example**:
```typescript
await program.methods
  .mint(new BN(1_000_000_000))  // 1,000 tokens (6 decimals)
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    minterInfo: minterInfoPDA,
    minter: minter.publicKey,
    tokenAccount: recipientTokenAccount,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([minter])
  .rpc();
```

---

#### 3. Burn

**Purpose**: Destroy tokens from an account (typically for fiat redemption).

**Parameters**:
- `amount: u64` - Amount of tokens to burn

**Accounts**:
```rust
pub struct Burn<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub token_account: Account<'info, token_2022::TokenAccount>,
    
    pub burner: Signer<'info>,
    
    pub token_program: Program<'info, token_2022::Token2022>,
}
```

**Validation**:
- Checks if token is paused
- Requires token account owner signature

**Example**:
```typescript
await program.methods
  .burn(new BN(500_000_000))  // 500 tokens
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    tokenAccount: tokenAccount,
    burner: owner.publicKey,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([owner])
  .rpc();
```

---

#### 4. Freeze Account

**Purpose**: Freeze a token account to prevent transfers (used for compliance or security).

**Parameters**: None

**Accounts**:
```rust
pub struct FreezeAccount<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub token_account: Account<'info, token_2022::TokenAccount>,
    
    pub freeze_authority: Signer<'info>,
    
    pub token_program: Program<'info, token_2022::Token2022>,
}
```

**Example**:
```typescript
await program.methods
  .freezeAccount()
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    tokenAccount: targetTokenAccount,
    freezeAuthority: freezeAuthority.publicKey,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([freezeAuthority])
  .rpc();
```

---

#### 5. Thaw Account

**Purpose**: Unfreeze a token account to allow transfers.

**Parameters**: None

**Accounts**: Same structure as `FreezeAccount`

**Example**:
```typescript
await program.methods
  .thawAccount()
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    tokenAccount: targetTokenAccount,
    freezeAuthority: freezeAuthority.publicKey,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([freezeAuthority])
  .rpc();
```

---

#### 6. Pause

**Purpose**: Globally pause all token operations (emergency stop).

**Parameters**: None

**Accounts**:
```rust
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = pauser @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    pub pauser: Signer<'info>,
}
```

**Validation**: Requires `pauser` role

**Example**:
```typescript
await program.methods
  .pause()
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    pauser: pauser.publicKey,
  })
  .signers([pauser])
  .rpc();
```

---

#### 7. Unpause

**Purpose**: Resume all token operations after a pause.

**Parameters**: None

**Accounts**: Same structure as `Pause`

**Example**:
```typescript
await program.methods
  .unpause()
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    pauser: pauser.publicKey,
  })
  .signers([pauser])
  .rpc();
```

---

#### 8. Add Minter

**Purpose**: Authorize a new minter with a specified quota.

**Parameters**:
- `quota: u64` - Maximum amount this minter can mint

**Accounts**:
```rust
pub struct AddMinter<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    pub minter: Signer<'info>,
    
    #[account(
        init,
        payer = master_authority,
        space = MinterInfo::LEN,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    #[account(mut)]
    pub master_authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

**Validation**: Requires `master_authority`

**Example**:
```typescript
await program.methods
  .addMinter(new BN(10_000_000_000))  // 10,000 tokens quota
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    minter: newMinter.publicKey,
    minterInfo: minterInfoPDA,
    masterAuthority: masterAuthority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([masterAuthority, newMinter])
  .rpc();
```

---

#### 9. Update Minter Quota

**Purpose**: Change a minter's quota limit.

**Parameters**:
- `new_quota: u64` - New maximum amount

**Accounts**:
```rust
pub struct UpdateMinterQuota<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    #[account(
        mut,
        seeds = [b"minter", config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump
    )]
    pub minter_info: Account<'info, MinterInfo>,
    
    pub minter: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub master_authority: Signer<'info>,
}
```

**Example**:
```typescript
await program.methods
  .updateMinterQuota(new BN(20_000_000_000))  // Increase to 20,000
  .accounts({
    config: configPDA,
    minterInfo: minterInfoPDA,
    minter: minter.publicKey,
    masterAuthority: masterAuthority.publicKey,
  })
  .signers([masterAuthority])
  .rpc();
```

---

#### 10. Remove Minter

**Purpose**: Remove minter authorization by setting quota to 0.

**Parameters**: None

**Accounts**: Similar to `UpdateMinterQuota`

**Example**:
```typescript
await program.methods
  .removeMinter()
  .accounts({
    config: configPDA,
    minterInfo: minterInfoPDA,
    minter: minter.publicKey,
    masterAuthority: masterAuthority.publicKey,
  })
  .signers([masterAuthority])
  .rpc();
```

---

#### 11. Update Roles

**Purpose**: Change role assignments (blacklister, pauser, seizer).

**Parameters**:
- `new_blacklister: Pubkey`
- `new_pauser: Pubkey`
- `new_seizer: Pubkey`

**Accounts**:
```rust
pub struct UpdateRoles<'info> {
    #[account(
        mut,
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = master_authority @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub master_authority: Signer<'info>,
}
```

**Example**:
```typescript
await program.methods
  .updateRoles(
    newBlacklister.publicKey,
    newPauser.publicKey,
    newSeizer.publicKey
  )
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    masterAuthority: masterAuthority.publicKey,
  })
  .signers([masterAuthority])
  .rpc();
```

---

#### 12. Transfer Authority

**Purpose**: Transfer master authority to a new address.

**Parameters**:
- `new_master_authority: Pubkey`

**Accounts**: Same structure as `UpdateRoles`

**Example**:
```typescript
await program.methods
  .transferAuthority(newMasterAuthority.publicKey)
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    masterAuthority: currentMasterAuthority.publicKey,
  })
  .signers([currentMasterAuthority])
  .rpc();
```

---

### SSS-2 Specific Instructions

#### 13. Add to Blacklist

**Purpose**: Blacklist an address for compliance reasons.

**Parameters**:
- `reason: String` - Reason for blacklisting (max 100 chars)

**Accounts**:
```rust
pub struct AddToBlacklist<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = blacklister @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub blacklister: Signer<'info>,
    
    pub user: UncheckedAccount<'info>,
    
    #[account(
        init,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [b"blacklist", config.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    
    pub system_program: Program<'info, System>,
}
```

**Validation**:
- Requires `blacklister` role
- Requires `enable_transfer_hook == true` in config
- Validates reason length

**Example**:
```typescript
await program.methods
  .addToBlacklist("OFAC SDN List match")
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    blacklister: blacklister.publicKey,
    user: targetUser.publicKey,
    blacklistEntry: blacklistEntryPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([blacklister])
  .rpc();
```

---

#### 14. Remove from Blacklist

**Purpose**: Remove an address from the blacklist.

**Parameters**: None

**Accounts**:
```rust
pub struct RemoveFromBlacklist<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = blacklister @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    #[account(mut)]
    pub blacklister: Signer<'info>,
    
    pub user: UncheckedAccount<'info>,
    
    #[account(
        mut,
        close = blacklister,
        seeds = [b"blacklist", config.key().as_ref(), user.key().as_ref()],
        bump = blacklist_entry.bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,
    
    pub system_program: Program<'info, System>,
}
```

**Validation**:
- Requires `blacklister` role
- Requires `enable_transfer_hook == true`
- Closes the blacklist entry account, returning rent

**Example**:
```typescript
await program.methods
  .removeFromBlacklist()
  .accounts({
    config: configPDA,
    blacklister: blacklister.publicKey,
    user: targetUser.publicKey,
    blacklistEntry: blacklistEntryPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([blacklister])
  .rpc();
```

---

#### 15. Seize

**Purpose**: Transfer tokens from a frozen account to treasury using permanent delegate.

**Parameters**:
- `amount: u64` - Amount to seize

**Accounts**:
```rust
pub struct Seize<'info> {
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
        has_one = seizer @ StablecoinError::Unauthorized
    )]
    pub config: Account<'info, StablecoinConfig>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    #[account(mut)]
    pub source_token: Account<'info, token_2022::TokenAccount>,
    
    #[account(mut)]
    pub dest_token: Account<'info, token_2022::TokenAccount>,
    
    pub seizer: Signer<'info>,
    
    pub token_program: Program<'info, token_2022::Token2022>,
}
```

**Validation**:
- Requires `seizer` role
- Requires `enable_permanent_delegate == true`
- Uses permanent delegate authority to transfer without user signature

**Example**:
```typescript
await program.methods
  .seize(new BN(1_000_000_000))  // 1,000 tokens
  .accounts({
    config: configPDA,
    mint: mintPubkey,
    sourceToken: frozenTokenAccount,
    destToken: treasuryTokenAccount,
    seizer: seizer.publicKey,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .signers([seizer])
  .rpc();
```

---

## Security & RBAC

### Role-Based Access Control

The program implements a principle of least privilege with distinct roles:

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Master Authority** | Administrative key | Add/remove minters, update roles, transfer authority |
| **Minter** | Token issuance | Mint tokens (within quota) |
| **Burner** | Token destruction | Burn tokens |
| **Freeze Authority** | Account control | Freeze/thaw accounts |
| **Blacklister** | Compliance management | Add/remove from blacklist (SSS-2) |
| **Pauser** | Emergency control | Pause/unpause operations |
| **Seizer** | Token seizure | Seize tokens from frozen accounts (SSS-2) |

### Key Design Principles

1. **No Single Point of Failure**: Each role has limited scope. Compromising one role doesn't compromise the entire system.

2. **Graceful Failure**: SSS-2 instructions fail gracefully if compliance modules aren't enabled:
   ```rust
   require!(
       config.enable_transfer_hook,
       StablecoinError::ComplianceNotEnabled
   );
   ```

3. **PDA Security**: PDAs cannot be signed by external keys, preventing unauthorized account manipulation.

4. **Token-2022 Authority**: The mint and freeze authority are separate from the program, allowing key rotation.

### Example: Seize Operation Flow

```
1. Seizer requests to seize 1,000 tokens from frozen account
   ↓
2. Program checks: enable_permanent_delegate == true?
   ↓ Yes
3. Program checks: signer == config.seizer?
   ↓ Yes
4. Program checks: source_token.owner == seizer? (via permanent delegate)
   ↓ Yes (delegate authority)
5. Execute transfer using Token-2022 TransferChecked
   ↓
6. Tokens moved to treasury account
```

---

## Transfer Hook Program

### Overview

The transfer hook program is a separate Anchor program that integrates with Token-2022's transfer hook extension. It validates every token transfer for SSS-2 compliant stablecoins.

### How Transfer Hooks Work

1. **Setup**: During mint initialization, the transfer hook extension is configured to call our program
2. **Transfer**: When a user transfers tokens, Token-2022 calls our transfer hook instruction
3. **Validation**: The transfer hook checks if sender or recipient is blacklisted
4. **Result**: If blacklisted, transfer fails; otherwise, transfer proceeds

### Transfer Hook Instructions

#### 1. Initialize Transfer Hook

**Purpose**: Set up the transfer hook data account for a mint.

**Accounts**:
```rust
pub struct InitializeTransferHook<'info> {
    #[account(
        init,
        payer = authority,
        space = TransferHookData::LEN,
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub mint: Account<'info, token_2022::Mint>,
    
    pub stablecoin_program: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
```

---

#### 2. Execute Transfer Hook

**Purpose**: Validate a token transfer (called automatically by Token-2022).

**Parameters**:
- `amount: u64` - Transfer amount

**Accounts**:
```rust
pub struct ExecuteTransferHook<'info> {
    #[account(
        seeds = [b"transfer_hook", mint.key().as_ref()],
        bump = hook_data.bump
    )]
    pub hook_data: Account<'info, TransferHookData>,
    
    pub stablecoin_program: UncheckedAccount<'info>,
    
    #[account(
        constraint = source_token.mint == hook_data.mint
    )]
    pub source_token: Account<'info, token_2022::TokenAccount>,
    
    #[account(
        constraint = dest_token.mint == hook_data.mint
    )]
    pub dest_token: Account<'info, token_2022::TokenAccount>,
    
    #[account(
        seeds = [b"blacklist", hook_data.mint.as_ref(), source_token.owner.as_ref()],
        bump
    )]
    pub sender_blacklist: UncheckedAccount<'info>,
    
    #[account(
        seeds = [b"blacklist", hook_data.mint.as_ref(), dest_token.owner.as_ref()],
        bump
    )]
    pub recipient_blacklist: UncheckedAccount<'info>,
    
    pub mint: Account<'info, token_2022::Mint>,
}
```

**Logic**:
```rust
pub fn execute(ctx: Context<ExecuteTransferHook>, amount: u64) -> Result<()> {
    let hook_data = &ctx.accounts.hook_data;
    
    // Check if paused
    require!(!hook_data.paused, TransferHookError::TransferPaused);
    
    // Get addresses
    let sender = &ctx.accounts.source_token.owner;
    let recipient = &ctx.accounts.dest_token.owner;
    
    // Check sender blacklist
    if ctx.accounts.sender_blacklist.data.borrow().len() > 0 {
        return Err(TransferHookError::SenderBlacklisted.into());
    }
    
    // Check recipient blacklist
    if ctx.accounts.recipient_blacklist.data.borrow().len() > 0 {
        return Err(TransferHookError::RecipientBlacklisted.into());
    }
    
    msg!("Transfer validated: {} tokens from {} to {}", amount, sender, recipient);
    Ok(())
}
```

### Cross-Program PDA Validation

The transfer hook uses the same seed pattern as the main program to derive blacklist PDAs:

```rust
// In transfer hook program
seeds = [b"blacklist", mint.key(), user_address.key()]

// In main program (when creating blacklist)
seeds = [b"blacklist", config.key(), user_address.key()]
```

Note: The transfer hook uses `mint.key()` while the main program uses `config.key()`. In the transfer hook, `hook_data.mint` is the mint, and in the main program, the config contains the mint. This allows cross-program PDA validation.

---

## Usage Examples

### Complete SSS-1 Deployment

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

async function deploySSS1() {
  const provider = anchor.AnchorProvider.env();
  const program = anchor.workspace.SssToken as Program<SssToken>;
  
  // Generate keypairs
  const authority = Keypair.generate();
  const mintKeypair = Keypair.generate();
  const minter = Keypair.generate();
  
  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
    program.programId
  );
  
  const [minterInfoPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("minter"),
      configPDA.toBuffer(),
      minter.publicKey.toBuffer(),
    ],
    program.programId
  );
  
  // 1. Initialize stablecoin (SSS-1)
  await program.methods
    .initialize(
      "My Stablecoin",
      "MYUSD",
      "https://example.com/metadata.json",
      6,  // 6 decimals
      false,  // No permanent delegate
      false,  // No transfer hook
      false   // Not frozen by default
    )
    .accounts({
      config: configPDA,
      mint: mintKeypair.publicKey,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority, mintKeypair])
    .rpc();
  
  // 2. Add minter
  await program.methods
    .addMinter(new BN(1_000_000_000_000))  // 1M tokens quota
    .accounts({
      config: configPDA,
      mint: mintKeypair.publicKey,
      minter: minter.publicKey,
      minterInfo: minterInfoPDA,
      masterAuthority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority, minter])
    .rpc();
  
  console.log("SSS-1 deployed successfully!");
  console.log("Mint:", mintKeypair.publicKey.toString());
  console.log("Config:", configPDA.toString());
}
```

### Complete SSS-2 Deployment

```typescript
async function deploySSS2() {
  const provider = anchor.AnchorProvider.env();
  const sssProgram = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace.TransferHook as Program<TransferHook>;
  
  // Generate keypairs
  const authority = Keypair.generate();
  const mintKeypair = Keypair.generate();
  const minter = Keypair.generate();
  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const pauser = Keypair.generate();
  
  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
    sssProgram.programId
  );
  
  const [hookDataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("transfer_hook"), mintKeypair.publicKey.toBuffer()],
    hookProgram.programId
  );
  
  // 1. Initialize stablecoin (SSS-2)
  await sssProgram.methods
    .initialize(
      "Compliant Stablecoin",
      "CUSD",
      "https://example.com/metadata.json",
      6,
      true,   // Enable permanent delegate
      true,   // Enable transfer hook
      false   // Not frozen by default
    )
    .accounts({
      config: configPDA,
      mint: mintKeypair.publicKey,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority, mintKeypair])
    .rpc();
  
  // 2. Initialize transfer hook
  await hookProgram.methods
    .initialize()
    .accounts({
      hookData: hookDataPDA,
      mint: mintKeypair.publicKey,
      stablecoinProgram: sssProgram.programId,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
  
  // 3. Update roles
  await sssProgram.methods
    .updateRoles(
      blacklister.publicKey,
      pauser.publicKey,
      seizer.publicKey
    )
    .accounts({
      config: configPDA,
      mint: mintKeypair.publicKey,
      masterAuthority: authority.publicKey,
    })
    .signers([authority])
    .rpc();
  
  // 4. Add minter
  const [minterInfoPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("minter"),
      configPDA.toBuffer(),
      minter.publicKey.toBuffer(),
    ],
    sssProgram.programId
  );
  
  await sssProgram.methods
    .addMinter(new BN(1_000_000_000_000))
    .accounts({
      config: configPDA,
      mint: mintKeypair.publicKey,
      minter: minter.publicKey,
      minterInfo: minterInfoPDA,
      masterAuthority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority, minter])
    .rpc();
  
  console.log("SSS-2 deployed successfully!");
  console.log("Mint:", mintKeypair.publicKey.toString());
  console.log("Config:", configPDA.toString());
  console.log("Transfer Hook Data:", hookDataPDA.toString());
}
```

### Blacklist Operations (SSS-2)

```typescript
async function blacklistOperations() {
  const program = anchor.workspace.SssToken as Program<SssToken>;
  const blacklister = Keypair.generate();
  const targetUser = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  
  const configPDA = /* derive config PDA */;
  const mintPubkey = /* mint public key */;
  
  // Derive blacklist entry PDA
  const [blacklistEntryPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("blacklist"),
      configPDA.toBuffer(),
      targetUser.toBuffer(),
    ],
    program.programId
  );
  
  // Add to blacklist
  await program.methods
    .addToBlacklist("OFAC SDN List match")
    .accounts({
      config: configPDA,
      mint: mintPubkey,
      blacklister: blacklister.publicKey,
      user: targetUser,
      blacklistEntry: blacklistEntryPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([blacklister])
    .rpc();
  
  console.log("User blacklisted successfully!");
  
  // Remove from blacklist
  await program.methods
    .removeFromBlacklist()
    .accounts({
      config: configPDA,
      blacklister: blacklister.publicKey,
      user: targetUser,
      blacklistEntry: blacklistEntryPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([blacklister])
    .rpc();
  
  console.log("User removed from blacklist!");
}
```

### Seize Operation (SSS-2)

```typescript
async function seizeTokens() {
  const program = anchor.workspace.SssToken as Program<SssToken>;
  const seizer = Keypair.generate();
  
  const configPDA = /* derive config PDA */;
  const mintPubkey = /* mint public key */;
  const frozenTokenAccount = /* frozen user's token account */;
  const treasuryTokenAccount = /* treasury token account */;
  
  // Seize 1,000 tokens from frozen account
  await program.methods
    .seize(new BN(1_000_000_000))
    .accounts({
      config: configPDA,
      mint: mintPubkey,
      sourceToken: frozenTokenAccount,
      destToken: treasuryTokenAccount,
      seizer: seizer.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([seizer])
    .rpc();
  
  console.log("Tokens seized successfully!");
}
```

---

## References

### Official Documentation

1. **Anchor Framework**
   - [Anchor Docs](https://www.anchor-lang.com/)
   - [Anchor Book](https://book.anchor-lang.com/)

2. **Solana**
   - [Solana Cookbook](https://solanacookbook.com/)
   - [Solana Developer Docs](https://docs.solana.com/)

3. **Token-2022 Extensions**
   - [Token Extensions Overview](https://solana.com/solutions/token-extensions)
   - [Permanent Delegate Guide](https://solana.com/developers/guides/token-extensions/permanent-delegate)
   - [Transfer Hook Guide](https://solana.com/developers/guides/token-extensions/transfer-hook)
   - [Confidential Transfers](https://solana.com/docs/tokens/extensions/confidential-transfer)

### Reference Implementations

1. **Solana Vault Standard (SVS)**
   - [GitHub Repository](https://github.com/solanabr/solana-vault-standard)
   - Used as quality and structure benchmark

2. **USDC on Solana**
   - [Circle Developer Docs](https://developers.circle.com/stablecoins/docs/usdc-on-solana)
   - Reference for compliant stablecoin implementation

3. **GENIUS Act Compliance**
   - [GENIUS Act Guide](https://www.steptoe.com/en/news-publications/blockchain-blog/the-genius-act-and-financial-crimes-compliance-a-detailed-guide.html)
   - Regulatory considerations for compliant stablecoins

### Token-2022 Program

The program uses `spl-token-2022` version 5.0.2, which includes:
- Metadata extension
- Permanent delegate extension
- Transfer hook extension
- Confidential transfer extension (for future SSS-3)

```toml
[dependencies]
spl-token-2022 = { version = "5.0.2", features = ["no-entrypoint"] }
```

---

## Summary

The Solana Stablecoin Standard (SSS) Anchor program provides a modular, production-ready implementation of stablecoin standards with:

- **Two standard presets**: SSS-1 (minimal) and SSS-2 (compliant)
- **Comprehensive RBAC**: Role-based access control with principle of least privilege
- **PDA-based state management**: Deterministic, program-owned accounts
- **Token-2022 integration**: Leverages modern Solana token extensions
- **Transfer hook support**: Real-time compliance validation for SSS-2
- **Graceful failure handling**: SSS-2 instructions fail if modules not enabled

The program is designed to be forked, customized, and deployed by institutions and builders, following the patterns established by the Solana Vault Standard.