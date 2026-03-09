# Test Setup Guide

## Running the SDK Tests

The SDK includes a comprehensive test suite that mirrors the Rust tests from the program.

### Prerequisites

Before running tests, you need:

1. **Solana CLI installed**: `npm install -g @solana/cli`
2. **Localnet or Devnet access**: Tests default to localnet (`http://localhost:8899`)
3. **Program deployed**: The SSS Token program must be deployed to your target network

### Running Tests

#### Option 1: Localnet (Recommended for Development)

1. Start Solana localnet:
```bash
solana-test-validator
```

2. In a new terminal, run tests:
```bash
cd sss-token/sdk
npm test
```

#### Option 2: Devnet

Set the provider URL and run tests:
```bash
cd sss-token/sdk
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npm test
```

#### Option 3: Custom Network

Set your custom Solana RPC URL:
```bash
cd sss-token/sdk
ANCHOR_PROVIDER_URL=https://your-custom-rpc.com npm test
```

### Test Coverage

The test suite covers all SDK functionality:

- ✅ Initialize stablecoin (SSS-1 minimal)
- ✅ Add minter with quota
- ✅ Remove minter
- ✅ Pause/unpause operations
- ✅ Transfer authority
- ✅ Update roles (blacklister, pauser, seizer)
- ✅ Mint tokens
- ✅ Enforce quota limits
- ✅ Burn tokens
- ✅ Freeze/thaw token accounts
- ✅ Update minter quota
- ✅ Add to blacklist
- ✅ Remove from blacklist
- ✅ Seize tokens
- ✅ Full workflow test (SSS-2 compliant)

### Test Configuration

Tests automatically:
- Generate keypairs for all roles
- Airdrop SOL to payer (if needed)
- Create token mints
- Initialize stablecoins
- Execute all program instructions

### Expected Output

Successful test run will show:
```
Creating token mint...
Mint created: [mint_address]

Initialize transaction: [signature]
Add minter transaction: [signature]
...
Full workflow test completed successfully!

  test_initialize_sss1_minimal_stablecoin
    ✓ should initialize a new stablecoin with minimal configuration
  test_add_minter
    ✓ should add a minter with specified quota
  ...

  18 passing
```

### Troubleshooting

**Error: "ANCHOR_PROVIDER_URL is not defined"**
- The tests now default to `http://localhost:8899`, so this error shouldn't occur
- If it does, set the environment variable as shown above

**Error: "Connection failed"**
- Ensure your Solana validator is running
- Check the RPC URL is correct
- Verify network connectivity

**Error: "Insufficient funds"**
- Tests automatically airdrop on devnet
- On localnet, you may need to configure a faucet

**Error: "Account already exists"**
- Clean up previous test accounts or restart the validator
- Tests use random keypairs to avoid conflicts

### Continuous Testing

For development, you can use watch mode:

```bash
npm run test:watch
```

This will re-run tests whenever files change.

### TypeScript Build

To verify TypeScript compilation without running tests:

```bash
npm run build
```

This will compile the SDK to the `dist/` directory.

### Example: Running a Single Test Suite

To run only specific tests:

```bash
npx mocha tests/sdk.test.ts --grep "test_mint_tokens"
```

Or specific test cases:

```bash
npx mocha tests/sdk.test.ts --grep "should mint tokens to a recipient account"