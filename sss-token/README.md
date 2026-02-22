# Solana Stablecoin Standard (SSS)

A modular Anchor-based implementation of stablecoin standards for Solana, using Token-2022 extensions. Supports two standard presets: SSS-1 (Minimal) and SSS-2 (Compliant).

## Overview

The Solana Stablecoin Standard provides production-ready templates for stablecoin issuers on Solana, implementing best practices for token management, compliance, and governance.

### Standards

- **SSS-1 (Minimal Stablecoin)**: Basic mint authority + freeze authority + metadata
  - Suitable for: Internal tokens, DAO treasuries, ecosystem settlement
  - Compliance: Reactive (freeze accounts as needed)

- **SSS-2 (Compliant Stablecoin)**: SSS-1 + permanent delegate + transfer hook + blacklist enforcement
  - Suitable for: Regulated stablecoins, USDC/USDT-class tokens
  - Compliance: Proactive (on-chain blacklist enforcement + seizure)

## Architecture

The project follows a three-layer architecture:

```
Layer 3: Standard Presets (SSS-1, SSS-2)
    ↓
Layer 2: Modules (Compliance, Privacy)
    ↓
Layer 1: Base SDK (Token creation, RBAC, Core operations)
```

### Key Components

1. **Main Program** (`sss-token`): Core stablecoin operations
2. **Transfer Hook Program** (`transfer-hook`): Compliance validation for SSS-2
3. **Token-2022 Extensions**: Metadata, Permanent Delegate, Transfer Hook

## Features

### Core Features (All Presets)

- ✅ Token creation with Token-2022 extensions
- ✅ Mint and burn operations
- ✅ Freeze and thaw accounts
- ✅ Global pause/unpause
- ✅ Role-based access control (RBAC)
- ✅ Minter quotas with tracking
- ✅ Metadata support

### SSS-2 Exclusive Features

- ✅ Blacklist management
- ✅ Real-time transfer validation via transfer hooks
- ✅ Token seizure via permanent delegate
- ✅ Graceful failure for non-compliance scenarios

## Account Structures

### StablecoinConfig
Main configuration account defining stablecoin behavior and roles.

**PDA Seeds**: `["config", mint.key()]`

### MinterInfo
Tracks minter quotas and minted amounts per authorized minter.

**PDA Seeds**: `["minter", config.key(), minter_authority.key()]`

### BlacklistEntry (SSS-2)
Marks addresses as blacklisted for compliance.

**PDA Seeds**: `["blacklist", config.key(), user_address.key()]`

### TransferHookData (SSS-2)
Stores transfer hook configuration for compliance validation.

**PDA Seeds**: `["transfer_hook", mint.key()]`

## PDA Logic

All program accounts use Program Derived Addresses (PDAs) for deterministic, program-owned state:

- **Config PDA**: Ensures one unique config per mint
- **MinterInfo PDA**: One per authorized minter per stablecoin
- **BlacklistEntry PDA**: One per blacklisted user
- **TransferHookData PDA**: Links transfer hook to specific mint

## Instructions

### Core Instructions

1. `initialize` - Create a new stablecoin with specified configuration
2. `mint` - Issue tokens to a recipient (with quota validation)
3. `burn` - Destroy tokens (for fiat redemption)
4. `freeze_account` - Freeze a token account
5. `thaw_account` - Unfreeze a token account
6. `pause` - Globally pause all operations
7. `unpause` - Resume operations
8. `add_minter` - Authorize a new minter with quota
9. `update_minter_quota` - Change a minter's quota
10. `remove_minter` - Remove minter authorization
11. `update_roles` - Change role assignments
12. `transfer_authority` - Transfer master authority

### SSS-2 Instructions

13. `add_to_blacklist` - Blacklist an address for compliance
14. `remove_from_blacklist` - Remove address from blacklist
15. `seize` - Transfer tokens from frozen account using permanent delegate

## Security & RBAC

The program implements principle of least privilege with distinct roles:

| Role | Description | Capabilities |
|------|-------------|--------------|
| Master Authority | Administrative key | Add/remove minters, update roles, transfer authority |
| Minter | Token issuance | Mint tokens (within quota) |
| Burner | Token destruction | Burn tokens |
| Freeze Authority | Account control | Freeze/thaw accounts |
| Blacklister (SSS-2) | Compliance management | Add/remove from blacklist |
| Pauser | Emergency control | Pause/unpause operations |
| Seizer (SSS-2) | Token seizure | Seize tokens from frozen accounts |

### Key Design Principles

1. **No Single Point of Failure**: Each role has limited scope
2. **Graceful Failure**: SSS-2 instructions fail if compliance modules not enabled
3. **PDA Security**: PDAs cannot be signed by external keys
4. **Token-2022 Authority**: Separate mint/freeze authority for key rotation

## Quick Start

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor 0.32.1+
- Node.js 18+

### Installation

```bash
# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Clone repository
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard/sss-token

# Install dependencies
anchor build
```

### Deploy SSS-1 (Minimal)

See the [deployment example](PROGRAM_DOCUMENTATION.md#complete-sss-1-deployment) in the program documentation.

### Deploy SSS-2 (Compliant)

See the [deployment example](PROGRAM_DOCUMENTATION.md#complete-sss-2-deployment) in the program documentation.

## Documentation

- [Program Documentation](../PROGRAM_DOCUMENTATION.md) - Complete technical documentation
- [Architecture Overview](../ARCH.md) - System architecture and design decisions
- [Build Requirements](../Build%20the%20Open%20Source.txt) - Detailed requirements and specifications

## Building

```bash
# Build programs
anchor build

# Run tests
anchor test

# Build for deployment
anchor build --verifiable
```

## Testing

```bash
# Run all tests
anchor test

# Run specific test
anchor test --skip-local-validator

# Run with detailed output
anchor test -- --nocapture
```

## Usage Examples

### Mint Tokens

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

### Blacklist Address (SSS-2)

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

### Seize Tokens (SSS-2)

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

## References

### Official Documentation

- [Anchor Docs](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Token-2022 Extensions](https://solana.com/solutions/token-extensions)
- [Permanent Delegate Guide](https://solana.com/developers/guides/token-extensions/permanent-delegate)
- [Transfer Hook Guide](https://solana.com/developers/guides/token-extensions/transfer-hook)

### Reference Implementations

- [Solana Vault Standard (SVS)](https://github.com/solanabr/solana-vault-standard) - Quality and structure benchmark
- [USDC on Solana](https://developers.circle.com/stablecoins/docs/usdc-on-solana) - Reference for compliant stablecoins
- [GENIUS Act Compliance Guide](https://www.steptoe.com/en/news-publications/blockchain-blog/the-genius-act-and-financial-crimes-compliance-a-detailed-guide.html) - Regulatory considerations

## Contributing

Contributions are welcome! Please read our contribution guidelines before submitting pull requests.

## License

MIT License - see [LICENSE](../LICENSE) for details

## Support

For questions and support:
- GitHub Issues: [Report issues](https://github.com/solanabr/solana-stablecoin-standard/issues)
- Documentation: [Read the docs](../PROGRAM_DOCUMENTATION.md)
- Community: [Join the discussion](https://github.com/solanabr/solana-stablecoin-standard/discussions)

## Acknowledgments

Built by Superteam Brazil as part of the Solana Stablecoin Standard initiative.

Special thanks to:
- Solana Foundation
- Anchor team
- Solana Vault Standard team for architectural inspiration

---

**Note**: This is an open-source standard. Institutions and builders are encouraged to fork, customize, and deploy according to their specific requirements.