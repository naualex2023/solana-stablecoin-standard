# SSS Token Documentation

Welcome to the SSS Token (Solana Stablecoin Standard) documentation.

## Overview

SSS Token is a comprehensive framework for building compliant stablecoins on Solana. It provides two preset configurations to meet different regulatory and operational needs.

### What is SSS Token?

SSS Token is a Solana Program (smart contract) combined with TypeScript SDK, CLI tools, and backend services that enables:

- **Stablecoin Issuance**: Mint and burn tokens with quota-managed minters
- **Compliance Controls**: Blacklist, freeze, and seizure capabilities (SSS-2)
- **Regulatory Compliance**: Built-in audit trails and KYC integration points
- **Operational Security**: Multi-role authority management and emergency controls

### Why SSS Token?

| Feature | SSS Token | Basic SPL Token |
|---------|-----------|-----------------|
| Multiple Minters | ✅ | ❌ |
| Minter Quotas | ✅ | ❌ |
| Blacklist | ✅ (SSS-2) | ❌ |
| Freeze/Seize | ✅ (SSS-2) | ❌ |
| Transfer Hooks | ✅ (SSS-2) | ❌ |
| Pause Capability | ✅ | ❌ |
| Audit Trail | ✅ | ❌ |

## Quick Start

### Prerequisites

- Node.js 18+
- Solana CLI tools
- Anchor Framework 0.29+
- Rust 1.75+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/solana-stablecoin-standard.git
cd solana-stablecoin-standard/sss-token

# Install dependencies
npm install

# Build the program
anchor build

# Run tests
./test.sh
```

## Testing

The project has a comprehensive test suite with **331 tests** covering both positive and negative scenarios.

### Test Summary

| Test Suite | Positive | Negative | Total |
|------------|----------|----------|-------|
| sss-token Rust | 70 | 98 | 168 |
| transfer-hook Rust | 8 | 18 | 26 |
| **Transfer Hook Integration** | **24** | - | **24** |
| **Trident Fuzz Tests** | **16** | - | **16** |
| SDK Basic (sdk.test.ts) | 15 | 23 | 38 |
| SDK Enhanced (sdk-enhanced.test.ts) | 23 | 21 | 44 |
| **TOTAL** | **171** | **160** | **331** |

### Test Commands

```bash
# Rust unit tests
cargo test --package sss-token --test sss_token
cargo test --package transfer-hook --test transfer_hook

# Transfer hook integration tests (24 tests)
cargo test --package transfer-hook --test transfer_hook_integration

# Trident fuzz tests (16 tests)
cd trident-tests && cargo test

# SDK integration tests
./test.sh           # Basic SDK tests (38 tests)
./test-enhanced.sh  # Enhanced SDK tests (44 tests)
```

For complete test documentation, see [TESTS.md](./sss-token/TESTS.md).

### Create Your First Stablecoin

#### Using CLI

```bash
# Navigate to CLI
cd cli && npm install && npm link

# Create SSS-2 compliant stablecoin
sss-token init --preset sss-2 --name "My USD" --symbol "MYUSD"

# Add a minter
sss-token minters add <ADDRESS> --quota 1000000000

# Mint tokens
sss-token mint <RECIPIENT> 1000000
```

#### Using SDK

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

// Connect to existing stablecoin
const stable = await SolanaStablecoin.connect(provider, {
  mint: new PublicKey("..."),
});

// Or create new
const newStable = await SolanaStablecoin.create(provider, {
  preset: Preset.SSS_2,
  name: "My USD",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
});

// Mint tokens
await stable.minting.mintTokens(authority, minter, recipient, amount);
```

## Preset Comparison

### SSS-1: Minimal Stablecoin

For non-regulated environments, testing, and simple tokenization.

```
┌─────────────────────────────────────┐
│           SSS-1 Features            │
├─────────────────────────────────────┤
│  ✅ Mint/Burn                       │
│  ✅ Multiple Minters with Quotas    │
│  ✅ Pause/Unpause                   │
│  ✅ Authority Management            │
│  ❌ No Blacklist                    │
│  ❌ No Freeze/Seize                 │
│  ❌ No Transfer Hooks               │
└─────────────────────────────────────┘
```

**Use Cases:**
- Development and testing
- Internal company tokens
- Non-regulated jurisdictions

### SSS-2: Compliant Stablecoin

For regulated stablecoins requiring full compliance controls.

```
┌─────────────────────────────────────┐
│           SSS-2 Features            │
├─────────────────────────────────────┤
│  ✅ All SSS-1 Features              │
│  ✅ Blacklist (On-chain)            │
│  ✅ Freeze/Thaw                     │
│  ✅ Seizure                         │
│  ✅ Transfer Hooks                  │
│  ✅ Default Account Frozen          │
│  ✅ Audit Trail                     │
└─────────────────────────────────────┘
```

**Use Cases:**
- Regulated stablecoins (USD, EUR)
- Institutional use
- KYC/AML compliant tokens

### Feature Matrix

| Feature | SSS-1 | SSS-2 |
|---------|:-----:|:-----:|
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

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SSS Token Architecture                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          Client Layer                                  │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐   │   │
│  │  │  Admin CLI  │    │  TypeScript │    │   Backend Services      │   │   │
│  │  │             │    │     SDK     │    │  (Mint, Compliance,     │   │   │
│  │  │  sss-token  │    │ @stbr/sss   │    │   Webhook, Indexer)     │   │   │
│  │  └─────────────┘    └─────────────┘    └─────────────────────────┘   │   │
│  │                                                                       │   │
│  │  ┌───────────────────────────────────────────────────────────────┐   │   │
│  │  │                     Web Frontend                               │   │   │
│  │  │              (Next.js 14 + Solana Wallet Adapter)             │   │   │
│  │  │   Dashboard • Create Stablecoin • Admin Ops • Holders        │   │   │
│  │  └───────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Solana Blockchain                               │   │
│  │  ┌─────────────────────────────┐    ┌─────────────────────────────┐  │   │
│  │  │     SSS Token Program       │    │    Transfer Hook Program    │  │   │
│  │  │                             │    │          (SSS-2)            │  │   │
│  │  │  • Config Account           │    │                             │  │   │
│  │  │  • Minter Info Accounts     │    │  • Blacklist Check          │  │   │
│  │  │  • Blacklist PDAs           │    │  • Transfer Validation      │  │   │
│  │  │  • Role Management          │    │                             │  │   │
│  │  └─────────────────────────────┘    └─────────────────────────────┘  │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Token-22 Mint                                 │ │   │
│  │  │  • Permanent Delegate (SSS-2)  • Freeze Authority               │ │   │
│  │  │  • Transfer Hook (SSS-2)       • Default Frozen (SSS-2)         │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Live Demo

**🌐 Web Interface**: https://solana-stablecoin-standard-amber.vercel.app/

The live demo showcases the SSS Token frontend deployed on Vercel, connected to Solana devnet.

## Documentation Index

| Document | Description |
|----------|-------------|
| [docs/README.md](./sss-token/docs/README.md) | Documentation hub and quick start |
| [docs/ARCHITECTURE.md](./sss-token/docs/ARCHITECTURE.md) | System architecture details |
| [docs/SDK.md](./sss-token/docs/SDK.md) | TypeScript SDK reference and examples |
| [docs/OPERATIONS.md](./sss-token/docs/OPERATIONS.md) | CLI-based operator runbook |
| [docs/SSS-1.md](./sss-token/docs/SSS-1.md) | Minimal stablecoin specification |
| [docs/SSS-2.md](./sss-token/docs/SSS-2.md) | Compliant stablecoin specification |
| [docs/COMPLIANCE.md](./sss-token/docs/COMPLIANCE.md) | Regulatory compliance guide |
| [docs/API.md](./sss-token/docs/API.md) | Backend API reference |
| [frontend/README.md](./sss-token/frontend/README.md) | Web UI documentation |

## Project Structure

```
sss-token/
├── programs/              # Solana programs (Anchor)
│   ├── sss-token/        # Main stablecoin program
│   └── transfer-hook/    # Transfer hook for SSS-2
├── sdk/                  # TypeScript SDK
│   ├── src/             # SDK source code
│   └── tests/           # SDK tests
├── cli/                  # Admin CLI tool
│   └── src/             # CLI source code
├── frontend/             # Web UI (Next.js 14)
│   ├── src/             # Frontend source code
│   │   ├── app/         # App Router pages
│   │   ├── components/  # React components
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # Utilities & API clients
│   └── public/          # Static assets
├── backend/              # Backend microservices
│   └── packages/
│       ├── mint-burn-service/
│       ├── compliance-service/
│       ├── webhook-service/
│       └── indexer/
├── docs/                 # Documentation
└── migrations/           # Deployment scripts
```

## Getting Help

- **Documentation**: Browse the `docs/` directory
- **Issues**: Open a GitHub issue
- **Examples**: See `sdk/examples/` for code samples

## License

MIT License - See [LICENSE](./LICENSE) for details.
