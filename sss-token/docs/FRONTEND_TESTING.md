# Frontend Admin Operations Testing Guide

This guide explains how to test the frontend admin operations (freeze, thaw, blacklist, seize, pause, mint, burn) using saved authority keypairs.

## Overview

The testing approach uses server-side API routes that load saved keypairs to sign transactions. This allows testing admin operations without needing to connect specific wallets in the browser.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   API Route     │────▶│   SDK/Program   │
│   Admin Page    │     │   /api/admin    │     │   (Solana)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │  Saved Keypairs │
                        │  test-wallets/  │
                        └─────────────────┘
```

## Setup

### Step 1: Start Local Validator

```bash
# Terminal 1: Start Solana test validator with the SSS Token program
cd sss-token
anchor localnet
```

Or manually:
```bash
solana-test-validator --reset \
  --bpf-program sssToken1111111111111111111111111111111111rQ target/deploy/sss_token.so
```

### Step 2: Build the SDK

```bash
cd sss-token/sdk
npm run build
```

### Step 3: Run Setup Script

```bash
cd sss-token
npm run setup:test-wallets
```

Or use the shell script:
```bash
./scripts/setup-test-env.sh
```

This will:
1. Generate keypairs for all roles (authority, blacklister, pauser, seizer, minter, user, treasury)
2. Save keypairs to `scripts/test-wallets/*.json`
3. Fund all accounts via airdrop
4. Create a Token-2022 mint with proper extensions
5. Initialize stablecoin config
6. Assign roles (blacklister, pauser, seizer)
7. Add minter with quota
8. Mint initial tokens to test user

### Step 4: Start Frontend

```bash
cd sss-token/frontend
npm run dev
```

Open http://localhost:3000/admin

## Testing Operations

The admin page will automatically detect the test configuration and display available test addresses. Use the "Fill" buttons to auto-populate addresses.

### Operations and Required Authorities

| Operation | Description | Authority Used |
|-----------|-------------|----------------|
| Freeze | Freeze a token account | authority |
| Thaw | Unfreeze a token account | authority |
| Blacklist Add | Add address to blacklist | blacklister |
| Blacklist Remove | Remove address from blacklist | blacklister |
| Seize | Seize tokens from frozen account | seizer |
| Pause | Pause all token operations | pauser |
| Unpause | Resume token operations | pauser |
| Mint | Create new tokens | authority |
| Burn | Destroy tokens | user (owner) |

### Test Workflow

1. **Test Freeze/Thaw:**
   - Select "Freeze Account"
   - Click "Fill User" to populate user's token account
   - Execute - account should freeze
   - Select "Thaw Account" to unfreeze

2. **Test Blacklist:**
   - Select "Add to Blacklist"
   - Enter user's wallet address (not token account)
   - Add reason (e.g., "Test blacklist")
   - Execute
   - Test removal with "Remove from Blacklist"

3. **Test Seize:**
   - First freeze the target account
   - Select "Seize Tokens"
   - Fill source (user token account) and destination (treasury)
   - Enter amount
   - Execute

4. **Test Pause/Unpause:**
   - Select "Pause Token"
   - Execute (no address needed)
   - All transfers blocked
   - Use "Unpause" to resume

5. **Test Mint:**
   - Select "Mint Tokens"
   - Enter recipient address
   - Enter amount
   - Execute

## Keypair Files

After setup, keypairs are saved in `scripts/test-wallets/`:

```
scripts/test-wallets/
├── config.json       # Test configuration (mint, addresses)
├── authority.json    # Main authority keypair
├── blacklister.json  # Blacklister authority
├── pauser.json       # Pauser authority
├── seizer.json       # Seizer authority
├── minter.json       # Minter with quota
├── user.json         # Test user
└── treasury.json     # Treasury account
```

### Importing into Wallets

To test with browser wallets (Phantom, Solflare):

1. Open wallet settings
2. Choose "Import existing wallet"
3. Copy the private key array from the JSON file
4. Paste and import

Example keypair format:
```json
[123, 45, 67, 89, ...]  // 64 bytes
```

## API Reference

### GET /api/admin

Returns test configuration:
```json
{
  "success": true,
  "config": {
    "mint": "...",
    "keypairs": {
      "authority": "...",
      "blacklister": "...",
      ...
    },
    "tokenAccounts": {
      "user": "...",
      "treasury": "..."
    }
  }
}
```

### POST /api/admin

Execute an admin operation:

```json
{
  "operation": "freeze",
  "mint": "...",
  "targetAddress": "..."
}
```

Response:
```json
{
  "success": true,
  "signature": "...",
  "operation": "freeze",
  "authority": "authority",
  "explorerUrl": "https://explorer.solana.com/tx/..."
}
```

## Troubleshooting

### "No test configuration found"
Run the setup script first: `npm run setup:test-wallets`

### "Failed to load authority keypair"
The keypair file doesn't exist. Re-run setup.

### Transaction fails with "custom program error"
- Check the authority has the correct role
- Verify the target address is correct
- For seize, ensure account is frozen first

### "SDK not built"
```bash
cd sdk && npm run build
```

## Security Note

**⚠️ NEVER use these test keypairs in production!** They are saved in plain JSON files and should only be used for local development testing.

For production:
- Store private keys securely (hardware wallets, HSMs)
- Use proper key management (AWS KMS, etc.)
- Implement multi-signature for critical operations