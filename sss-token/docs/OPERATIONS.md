# SSS Token Operations Runbook

Operator guide for managing SSS Token stablecoins using the admin CLI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [CLI Installation](#cli-installation)
- [Configuration](#configuration)
- [Role-Based Access Control](#role-based-access-control)
- [Minting Operations](#minting-operations)
- [Burning Operations](#burning-operations)
- [Freeze Operations](#freeze-operations)
- [Seizure Operations](#seizure-operations)
- [Blacklist Operations](#blacklist-operations)
- [Pause Operations](#pause-operations)
- [Authority Management](#authority-management)
- [Monitoring](#monitoring)
- [Incident Response](#incident-response)

## Prerequisites

- Solana CLI tools installed (`solana --version`)
- Access to operator keypairs
- SOL for transaction fees
- RPC endpoint access

### Environment Setup

```bash
# Set cluster
solana config set --url mainnet-beta

# Verify keypair
solana address

# Check balance
solana balance

# Set environment variables
export ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"
export ANCHOR_KEYPAIR_PATH="~/.config/solana/operator.json"
```

## CLI Installation

```bash
# Navigate to CLI directory
cd sss-token/cli

# Install dependencies
npm install

# Build
npm run build

# Link for global use
npm link

# Verify installation
sss-token --help
```

## Configuration

### Initial Setup

```bash
# Configure RPC endpoint
sss-token config --rpc https://api.mainnet-beta.solana.com

# Set keypair path
sss-token config --keypair ~/.config/solana/operator.json

# Set default mint address
sss-token config --mint <MINT_ADDRESS>

# View current configuration
sss-token config
```

### Configuration File

Configuration is stored in `~/.sss-token.json`:

```json
{
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "keypairPath": "~/.config/solana/operator.json",
  "mint": "MINT_ADDRESS_HERE"
}
```

## Role-Based Access Control

### Roles Overview

| Role | Capabilities | Key Security |
|------|--------------|--------------|
| Master Authority | All operations, role management | HSM / Multi-sig |
| Blacklister | Add/remove blacklist entries | Hot wallet |
| Pauser | Pause/unpause operations | Hot wallet |
| Seizer | Seize tokens from accounts | HSM / Multi-sig |
| Minter | Mint tokens within quota | Hot wallet |

### Check Current Roles

```bash
# View stablecoin status including roles
sss-token status
```

## Minting Operations

### Add New Minter

**When:** Onboarding new minting partner

```bash
# Add minter with quota (amount in base units)
sss-token minters add <ADDRESS> --quota 1000000000

# Verify minter was added
sss-token minters info <ADDRESS>
```

**Example:**
```bash
$ sss-token minters add 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --quota 1000000000
✓ Minter added successfully
  Address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
  Quota: 1,000,000,000
  Transaction: 5Kt...
```

### Update Minter Quota

**When:** Adjusting minting limits

```bash
# Check current quota and usage
sss-token minters info <ADDRESS>

# Update quota
sss-token minters update-quota <ADDRESS> 2000000000

# Verify change
sss-token minters info <ADDRESS>
```

### Remove Minter

**When:** Offboarding minter

```bash
# Remove minter (sets quota to 0)
sss-token minters remove <ADDRESS>

# Verify removal
sss-token minters info <ADDRESS>
# Output: Quota: 0
```

### Mint Tokens

**When:** Minting new tokens to reserves

```bash
# Mint tokens to recipient
sss-token mint <RECIPIENT_ADDRESS> 1000000

# Verify balance
sss-token balance <RECIPIENT_ADDRESS>

# Check total supply
sss-token supply
```

**Example:**
```bash
$ sss-token mint 9WzDXoBz756D64mR4Dc9YqfiM48EgRg6LQJqX9xHvPqK 1000000
✓ Minted 1,000,000 tokens to 9WzDXoBz756D64mR4Dc9YqfiM48EgRg6LQJqX9xHvPqK
  Transaction: 3Bx...
  
$ sss-token supply
Total Supply: 1,000,000
```

## Burning Operations

### Burn Tokens

**When:** Redeeming tokens, reducing supply

```bash
# Burn tokens from your account
sss-token burn 500000

# Verify new supply
sss-token supply

# Check your balance
sss-token balance
```

## Freeze Operations

### Freeze Token Account

**When:** Suspicious activity, compliance hold

```bash
# Freeze account
sss-token freeze <TOKEN_ACCOUNT_ADDRESS>

# Verify frozen status
sss-token status
```

**Example:**
```bash
$ sss-token freeze HXkQ7vZvE8YF4R4L8Z1X8Y5V2W8Q7X9Z1Y3W5V7L9K1M
✓ Account frozen
  Account: HXkQ7vZvE8YF4R4L8Z1X8Y5V2W8Q7X9Z1Y3W5V7L9K1M
  Transaction: 7Kp...
```

### Thaw Token Account

**When:** Investigation complete, account cleared

```bash
# Unfreeze account
sss-token thaw <TOKEN_ACCOUNT_ADDRESS>

# Verify thawed
sss-token balance <TOKEN_ACCOUNT_ADDRESS>
```

## Seizure Operations

### Seize Tokens

**When:** Court order, regulatory requirement

> ⚠️ **Critical Operation** - Requires legal documentation

```bash
# Seize all tokens from account
sss-token seize <SOURCE_TOKEN_ACCOUNT>

# Seize specific amount
sss-token seize <SOURCE_TOKEN_ACCOUNT> --amount 500000

# Seize to specific treasury
sss-token seize <SOURCE_TOKEN_ACCOUNT> --to <TREASURY_ACCOUNT>
```

**Prerequisites:**
1. Account must be frozen first
2. Legal order must be documented
3. Transaction logged for audit

**Example:**
```bash
# Step 1: Freeze the account
$ sss-token freeze HXkQ7vZvE8YF4R4L8Z1X8Y5V2W8Q7X9Z1Y3W5V7L9K1M
✓ Account frozen

# Step 2: Seize tokens
$ sss-token seize HXkQ7vZvE8YF4R4L8Z1X8Y5V2W8Q7X9Z1Y3W5V7L9K1M --to TreasuryAccount...
✓ Seizure complete
  Amount: 500,000
  From: HXkQ7vZvE8YF4R4L8Z1X8Y5V2W8Q7X9Z1Y3W5V7L9K1M
  To: TreasuryAccount...
  Transaction: 9Lm...
```

## Blacklist Operations

### Add to Blacklist

**When:** Sanctions update, fraud detection

```bash
# Add address to blacklist
sss-token blacklist add <ADDRESS> --reason "OFAC match"

# Verify blacklist status
sss-token blacklist check <ADDRESS>
```

**Example:**
```bash
$ sss-token blacklist add 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --reason "OFAC SDN list match"
✓ Address blacklisted
  Address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
  Reason: OFAC SDN list match
  Transaction: 2Mp...
```

### Bulk Blacklist Import

**When:** Updating from sanctions lists

```bash
# Import from file (one address per line)
while read address; do
  sss-token blacklist add "$address" --reason "OFAC update $(date +%Y-%m-%d)"
done < ofac_addresses.txt

# Or use xargs
cat ofac_addresses.txt | xargs -I {} sss-token blacklist add {} --reason "OFAC update"
```

### Remove from Blacklist

**When:** False positive, removed from sanctions

```bash
# Remove from blacklist
sss-token blacklist remove <ADDRESS>

# Verify removal
sss-token blacklist check <ADDRESS>
```

### Check Blacklist Status

```bash
# Check if address is blacklisted
sss-token blacklist check <ADDRESS>
```

## Pause Operations

### Emergency Pause

**When:** Security incident, critical vulnerability

```bash
# Pause all operations immediately
sss-token pause

# Verify paused
sss-token status
```

**Example:**
```bash
$ sss-token pause
⚠️  EMERGENCY PAUSE ACTIVATED
  All token operations are now paused
  Transaction: 4Np...
  
$ sss-token status
Stablecoin: USD Coin (USDC)
Status: PAUSED
Total Supply: 10,000,000
...
```

### Unpause

**When:** Issue resolved, operations can resume

```bash
# Resume operations
sss-token unpause

# Verify unpaused
sss-token status
```

## Authority Management

### Transfer Master Authority

**When:** Key rotation, organizational change

> ⚠️ **Critical Operation** - Irreversible

```bash
# Transfer master authority
sss-token transfer-authority <NEW_AUTHORITY_ADDRESS>

# Verify transfer
sss-token status
```

### Update Compliance Roles

**When:** Personnel changes

```bash
# Update individual role
sss-token roles update --blacklister <NEW_ADDRESS>

# Update multiple roles
sss-token roles update \
  --blacklister <BLACKLISTER_ADDRESS> \
  --pauser <PAUSER_ADDRESS> \
  --seizer <SEIZER_ADDRESS>

# Verify changes
sss-token status
```

## Monitoring

### Status Check

```bash
# View complete stablecoin status
sss-token status
```

Output includes:
- Token name and symbol
- Pause status
- Total supply
- Role assignments
- Mint address

### Balance Checks

```bash
# Check your balance
sss-token balance

# Check any address balance
sss-token balance <ADDRESS>

# Check total supply
sss-token supply
```

### Minter Monitoring

```bash
# Check specific minter
sss-token minters info <ADDRESS>

# Output shows:
# - Quota
# - Minted amount
# - Remaining capacity
```

## Incident Response

### P0: Security Exploit

```bash
# 1. IMMEDIATE: Pause all operations
sss-token pause

# 2. Document incident
echo "PAUSE: $(date) - Security incident detected" >> incident.log

# 3. Freeze affected accounts
sss-token freeze <AFFECTED_ACCOUNT_1>
sss-token freeze <AFFECTED_ACCOUNT_2>

# 4. Blacklist malicious addresses
sss-token blacklist add <MALICIOUS_ADDRESS> --reason "Exploit address"

# 5. After resolution: Unpause
sss-token unpause
```

### P1: Unauthorized Activity

```bash
# 1. Freeze suspicious account
sss-token freeze <SUSPICIOUS_ACCOUNT>

# 2. Add to blacklist if confirmed
sss-token blacklist add <ADDRESS> --reason "Unauthorized activity"

# 3. Seize if required
sss-token seize <ACCOUNT> --to <TREASURY>
```

### P2: Sanctions List Update

```bash
# Process OFAC updates
cat new_sanctions.txt | while read address; do
  sss-token blacklist add "$address" --reason "OFAC $(date +%Y-%m-%d)"
done
```

## Quick Reference Card

| Operation | Command |
|-----------|---------|
| Check status | `sss-token status` |
| Check balance | `sss-token balance [address]` |
| Check supply | `sss-token supply` |
| Mint tokens | `sss-token mint <to> <amount>` |
| Burn tokens | `sss-token burn <amount>` |
| Freeze account | `sss-token freeze <account>` |
| Thaw account | `sss-token thaw <account>` |
| Pause operations | `sss-token pause` |
| Unpause operations | `sss-token unpause` |
| Add to blacklist | `sss-token blacklist add <addr> --reason "..."` |
| Remove from blacklist | `sss-token blacklist remove <addr>` |
| Check blacklist | `sss-token blacklist check <addr>` |
| Seize tokens | `sss-token seize <account> [--amount X] [--to Y]` |
| Add minter | `sss-token minters add <addr> --quota X` |
| Remove minter | `sss-token minters remove <addr>` |
| Check minter | `sss-token minters info <addr>` |
| Update quota | `sss-token minters update-quota <addr> <quota>` |
| Update roles | `sss-token roles update --blacklister X ...` |
| Transfer authority | `sss-token transfer-authority <new>` |

## Troubleshooting

### Transaction Failed

```bash
# Check balance for fees
solana balance

# Request airdrop (devnet only)
solana airdrop 1

# Check if paused
sss-token status
```

### Insufficient Permissions

```bash
# Verify your keypair
solana address

# Check current roles
sss-token status

# Ensure you have the required role
```

### Account Not Found

```bash
# Verify the address is correct
solana account <ADDRESS>

# Check if it's a token account
spl-token accounts --owner <OWNER_ADDRESS>
```

## See Also

- [CLI README](../cli/README.md)
- [SDK Documentation](./SDK.md)
- [Compliance Guide](./COMPLIANCE.md)