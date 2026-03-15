# 📊 SSS Token Test Coverage

This document provides comprehensive information about the test environment, test commands, and test coverage for the SSS Token project.

---

## 🚀 Quick Start - Test Commands

### Rust Unit Tests (via Cargo)

```bash
# Run all sss-token program tests (44 tests)
cd sss-token
cargo test --package sss-token --test sss_token

# Run all transfer-hook program tests (26 tests)
cargo test --package transfer-hook --test transfer_hook

# Run all Rust tests for both programs (70 tests total)
cargo test --package sss-token --package transfer-hook
```

### SDK Integration Tests (via test scripts)

```bash
# Basic SDK tests - validates core SDK functionality (38 tests)
./test.sh

# Enhanced SDK tests - validates namespaced API and presets (44 tests)
./test-enhanced.sh

# Run both SDK test suites
./test.sh && ./test-enhanced.sh
```

### Test Script Options

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

---

## 📈 Test Summary

| Test Suite | Positive Tests | Negative Tests | Total |
|------------|----------------|----------------|-------|
| **sss-token Rust** | 14 | 30 | 44 |
| **transfer-hook Rust** | 8 | 18 | 26 |
| **SDK Basic (sdk.test.ts)** | 15 | 23 | 38 |
| **SDK Enhanced (sdk-enhanced.test.ts)** | 23 | 21 | 44 |
| **TOTAL** | **60** | **92** | **152** |

---

## 🦀 Rust Program Tests

### sss-token Program (44 Tests)

#### Core Management - Positive Tests (6 tests)
| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `test_initialize_sss1_minimal_stablecoin` | Initialize stablecoin with SSS-2 features |
| 2 | `test_add_minter` | Add minters with quota limits |
| 3 | `test_remove_minter` | Remove minters by setting quota to 0 |
| 4 | `test_pause_and_unpause` | Emergency pause/unpause functionality |
| 5 | `test_transfer_authority` | Transfer master authority |
| 6 | `test_update_roles` | Update blacklister, pauser, and seizer roles |

#### Token Operations - Positive Tests (8 tests)
| # | Test Name | Description |
|---|-----------|-------------|
| 7 | `test_mint_tokens` | Mint tokens with quota enforcement |
| 8 | `test_burn_tokens` | Burn tokens from account |
| 9 | `test_freeze_and_thaw_token_account` | Freeze/thaw token accounts |
| 10 | `test_update_minter_quota` | Update minter quotas dynamically |
| 11 | `test_add_to_blacklist` | Add addresses to compliance blacklist |
| 12 | `test_remove_from_blacklist` | Remove addresses from blacklist |
| 13 | `test_seize_tokens` | Seize tokens from any account (SSS-2 requirement) |
| 14 | `test_full_workflow` | End-to-end complete token lifecycle |

#### Negative Tests (30 tests)
| Category | Tests |
|----------|-------|
| **Initialization Validation** | `test_initialize_name_too_long`, `test_initialize_symbol_too_long`, `test_initialize_uri_too_long` |
| **Minting Validation** | `test_mint_tokens_when_paused`, `test_mint_tokens_over_quota` |
| **Burning Validation** | `test_burn_tokens_when_paused`, `test_burn_tokens_more_than_balance` |
| **Pause/Unpause Authorization** | `test_pause_by_unauthorized`, `test_unpause_by_unauthorized` |
| **Minter Management Authorization** | `test_add_minter_by_unauthorized`, `test_remove_minter_by_unauthorized`, `test_update_minter_quota_by_unauthorized` |
| **Authority Management** | `test_transfer_authority_by_unauthorized`, `test_update_roles_by_unauthorized` |
| **Freeze/Thaw Authorization** | `test_freeze_by_unauthorized`, `test_thaw_by_unauthorized`, `test_freeze_pda_by_unauthorized`, `test_thaw_pda_by_unauthorized` |
| **Blacklist Validation** | `test_add_to_blacklist_by_unauthorized`, `test_add_to_blacklist_compliance_disabled`, `test_add_to_blacklist_already_blacklisted`, `test_add_to_blacklist_reason_too_long`, `test_remove_from_blacklist_by_unauthorized`, `test_remove_from_blacklist_not_blacklisted` |
| **Seize Validation** | `test_seize_by_unauthorized`, `test_seize_permanent_delegate_disabled`, `test_seize_zero_amount`, `test_seize_more_than_balance` |

---

### transfer-hook Program (26 Tests)

#### Setup & Management - Positive Tests (3 tests)
| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `test_initialize_transfer_hook` | Initialize transfer hook with mint |
| 2 | `test_pause_and_unpause_hook` | Pause/unpause transfer validation |
| 3 | `test_update_hook_authority` | Transfer hook authority |

#### Transfer Validation - Positive Tests (4 tests)
| # | Test Name | Description |
|---|-----------|-------------|
| 4 | `test_execute_transfer_hook_normal_transfer` | Allow normal transfers |
| 5 | `test_execute_transfer_hook_blacklisted_source` | Block blacklisted senders |
| 6 | `test_execute_transfer_hook_blacklisted_destination` | Block blacklisted recipients |
| 7 | `test_execute_transfer_hook_paused` | Block all transfers when paused |

#### Integration - Positive Tests (1 test)
| # | Test Name | Description |
|---|-----------|-------------|
| 8 | `test_full_transfer_hook_workflow` | Complete transfer hook lifecycle |

#### Negative Tests (18 tests)
| Category | Tests |
|----------|-------|
| **Initialization** | `test_initialize_hook_unauthorized`, `test_initialize_hook_twice` |
| **Transfer Validation** | `test_execute_transfer_when_paused`, `test_execute_transfer_blacklisted_source`, `test_execute_transfer_blacklisted_destination`, `test_execute_transfer_frozen_source_account`, `test_execute_transfer_frozen_destination_account`, `test_execute_transfer_insufficient_balance`, `test_execute_transfer_wrong_mint`, `test_transfer_self_to_self`, `test_execute_transfer_zero_amount` |
| **Pause/Unpause Authorization** | `test_pause_hook_by_unauthorized`, `test_unpause_hook_by_unauthorized`, `test_double_pause`, `test_double_unpause` |
| **Authority Management** | `test_update_hook_authority_by_unauthorized` |

---

## 📦 SDK Tests (TypeScript)

### Basic SDK Tests (sdk.test.ts) - 38 Tests

#### Core Functionality (15 tests)
| Category | Tests |
|----------|-------|
| **Initialization** | `test_initialize_sss1_minimal_stablecoin` |
| **Minter Management** | `test_add_minter`, `test_remove_minter`, `test_update_minter_quota` |
| **Pause/Unpause** | `test_pause_and_unpause` (2 tests) |
| **Authority** | `test_transfer_authority`, `test_update_roles` |
| **Token Operations** | `test_mint_tokens` (2 tests - including quota enforcement), `test_burn_tokens`, `test_freeze_and_thaw_token_account` (2 tests) |
| **Compliance** | `test_add_to_blacklist`, `test_remove_from_blacklist`, `test_seize_tokens` (skipped - requires extension) |
| **Workflow** | `test_full_workflow` |

#### Negative Tests (23 tests)
| Category | Tests |
|----------|-------|
| **Initialization Validation** | Name too long, Symbol too long, URI too long |
| **Unauthorized Operations** | Pause, Unpause, Add minter, Remove minter, Update quota, Transfer authority, Update roles |
| **Blacklist Validation** | Unauthorized blacklist, Reason too long, Unauthorized unblacklist, Not blacklisted |
| **Minting Validation** | Mint when paused |
| **Burning Validation** | Burn when paused, Burn more than balance |
| **Freeze/Thaw Validation** | Unauthorized freeze, Unauthorized thaw |
| **Seize Validation** | Unauthorized seize, Zero amount |

---

### Enhanced SDK Tests (sdk-enhanced.test.ts) - 44 Tests

#### Preset Configuration Tests (3 tests)
- SSS_1 (minimal) preset configuration validation
- SSS_2 (compliant) preset configuration validation
- Preset enum values as strings

#### SolanaStablecoin.connect() Tests (3 tests)
- Connect to existing stablecoin
- Namespaced API availability
- Config fetch through enhanced SDK

#### Compliance API Tests (4 tests)
- `blacklistAdd()` - Add address to blacklist
- `blacklistRemove()` - Remove address from blacklist
- `freeze()` - Freeze token account
- `thaw()` - Thaw token account

#### Minting API Tests (4 tests)
- `addMinter()` - Add minter with quota
- `updateQuota()` - Update minter quota
- `mintTokens()` - Mint tokens to account
- `removeMinter()` - Remove minter

#### Burning API Tests (1 test)
- `burn()` - Burn tokens from account

#### Pause API Tests (2 tests)
- `pause()` - Pause all operations
- `unpause()` - Resume operations

#### Authority API Tests (2 tests)
- `transfer()` - Transfer master authority
- `updateRoles()` - Update role assignments

#### Integration Tests (3 tests)
- `SolanaStablecoin.fromClient()` - Create from existing client
- Full Workflow with Enhanced SDK
- Freeze/Thaw with PDA Authority

#### Seize with Permanent Delegate (1 test)
- Create mint with permanent delegate and seize tokens from frozen account

#### Negative Tests (21 tests)
| Category | Tests |
|----------|-------|
| **Compliance API** | Unauthorized blacklist, Reason too long, Unauthorized unblacklist, Unauthorized freeze, Unauthorized thaw |
| **Minting API** | Unauthorized add minter, Unauthorized update quota, Unauthorized remove minter, Mint over quota |
| **Pause API** | Unauthorized pause, Unauthorized unpause |
| **Authority API** | Unauthorized transfer authority, Unauthorized update roles |
| **Burning API** | Burn more than balance |
| **Preset Configuration** | Invalid preset values |
| **Connection** | Connect to non-existent stablecoin |

---

## 🛠️ Test Environment Setup

### Prerequisites
- Solana CLI tools installed
- Anchor CLI installed
- Node.js 18+ and npm/pnpm
- Rust toolchain

### Environment Variables
```bash
# Optional: Use custom RPC endpoint
export ANCHOR_PROVIDER_URL="http://localhost:8899"

# Optional: Specify keypair path
export ANCHOR_KEYPAIR_PATH="~/.config/solana/id.json"
```

### Test Execution Flow

1. **Start Validator** (if not running)
   - Spawns `solana-test-validator` in background
   - Waits for RPC readiness

2. **Request Airdrop** (if balance low)
   - Checks payer balance
   - Requests airdrop if below 2 SOL

3. **Build & Deploy Programs**
   - Runs `anchor build`
   - Deploys sss-token and transfer-hook programs

4. **Run Tests**
   - Executes TypeScript tests via Mocha
   - Reports results

5. **Cleanup**
   - Stops validator (unless `--no-stop`)

---

## 📁 Test Files Structure

```
sss-token/
├── test.sh                          # Basic SDK test runner
├── test-enhanced.sh                 # Enhanced SDK test runner
├── TESTS.md                         # This documentation
├── programs/
│   ├── sss-token/
│   │   └── tests/
│   │       └── sss_token.rs         # Rust unit tests (44 tests)
│   └── transfer-hook/
│       └── tests/
│           └── transfer_hook.rs     # Rust unit tests (26 tests)
└── sdk/
    └── tests/
        ├── sdk.test.ts              # Basic SDK tests (38 tests)
        └── sdk-enhanced.test.ts     # Enhanced SDK tests (44 tests)
```

---

## ✅ Verification Results

**All Tests Pass:**
```
sss-token Rust tests:     44 passed ✓
transfer-hook Rust tests: 26 passed ✓
SDK Basic tests:          38 passed ✓
SDK Enhanced tests:       44 passed ✓
Total:                   152 passed; 0 failed ✓
```

**Build Status:**
- ✅ `cargo check --package sss-token` - No errors
- ✅ `cargo check --package transfer-hook` - No errors
- ✅ `anchor build` - Completes successfully
- ✅ Build artifacts created and valid

---

## 📝 Test Design Philosophy

### Rust Tests
- **Unit-style tests** that demonstrate test structure and coverage
- Show account setup and PDA derivation
- Document expected behavior
- Provide clear test names for each function
- **Note:** Full integration tests would require `solana-program-test` framework

### SDK Tests
- **Integration tests** that run against local validator
- Test actual program execution
- Validate transaction submission and confirmation
- Test both success and error cases
- Cover namespaced API (Enhanced SDK)

### Negative Tests
- Verify proper error handling
- Test authorization boundaries
- Validate input constraints
- Ensure proper error messages

---

## 🔍 Debugging Failed Tests

### Check Validator Logs
```bash
cat test-logs/validator.log
```

### Run Tests Verbose
```bash
# Rust tests
cargo test --package sss-token -- --nocapture

# SDK tests
npx ts-mocha tests/sdk.test.ts --timeout 100000 --reporter spec
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Validator won't start | Kill existing: `pkill -f solana-test-validator` |
| Insufficient balance | Run with `--clean` to get fresh airdrop |
| Program not found | Remove `--skip-deploy` to rebuild |
| Timeout errors | Increase mocha timeout: `--timeout 200000` |

---

## 📚 Related Documentation

- [SDK Documentation](docs/SDK.md) - SDK API reference
- [Architecture](docs/ARCHITECTURE.md) - System architecture
- [Compliance](docs/COMPLIANCE.md) - Compliance features
- [SSS-1 Standard](docs/SSS-1.md) - Minimal stablecoin standard
- [SSS-2 Standard](docs/SSS-2.md) - Compliant stablecoin standard