# SSS Token Admin CLI

Command-line interface for managing SSS Token stablecoins on Solana. Supports both SSS-1 (minimal) and SSS-2 (compliant) presets.

## Installation

```bash
# From source
cd sss-token/cli
npm install
npm run build

# Link for global use
npm link
```

## Prerequisites

1. **Solana CLI tools** installed and configured
2. **A keypair** with SOL for transaction fees
3. **RPC endpoint** (local, devnet, or mainnet)

## Configuration

The CLI can be configured via environment variables or command options:

```bash
# Set via environment variables
export ANCHOR_PROVIDER_URL="http://localhost:8899"
export ANCHOR_KEYPAIR_PATH="~/.config/solana/id.json"

# Or use options
sss-token --rpc https://api.devnet.solana.com config
```

## Usage

### Initialize a New Stablecoin

```bash
# SSS-1 (Minimal Stablecoin)
sss-token init --preset sss-1 --name "My Stablecoin" --symbol "MYST"

# SSS-2 (Compliant Stablecoin with blacklist + seizure)
sss-token init --preset sss-2 --name "Regulated Stable" --symbol "RUSD"

# Custom configuration
sss-token init --custom config.toml
```

### Token Operations

```bash
# Mint tokens
sss-token mint <recipient-address> 1000

# Burn tokens
sss-token burn 500

# Check balance
sss-token balance
sss-token balance <address>

# Check total supply
sss-token supply

# Show status
sss-token status
```

### Account Management

```bash
# Freeze account
sss-token freeze <token-account-address>

# Unfreeze account
sss-token thaw <token-account-address>
```

### Pause/Unpause

```bash
# Pause all operations
sss-token pause

# Resume operations
sss-token unpause
```

### Minter Management

```bash
# Add minter with quota
sss-token minters add <address> --quota 1000000000

# Remove minter
sss-token minters remove <address>

# View minter info
sss-token minters info <address>

# Update quota
sss-token minters update-quota <address> 500000000
```

### Blacklist Management (SSS-2)

```bash
# Add to blacklist
sss-token blacklist add <address> --reason "OFAC match"

# Remove from blacklist
sss-token blacklist remove <address>

# Check blacklist status
sss-token blacklist check <address>
```

### Seize Tokens (SSS-2)

```bash
# Seize all tokens from an account
sss-token seize <source-token-account>

# Seize specific amount
sss-token seize <source-token-account> --amount 1000

# Seize to specific treasury
sss-token seize <source-token-account> --to <treasury-account>
```

### Role Management

```bash
# Update roles
sss-token roles update --blacklister <address> --pauser <address> --seizer <address>

# Transfer master authority
sss-token transfer-authority <new-authority-address>
```

### Configuration

```bash
# View current config
sss-token config

# Set RPC URL
sss-token config --rpc https://api.mainnet-beta.solana.com

# Set keypair
sss-token config --keypair /path/to/keypair.json

# Set default mint
sss-token config --mint <mint-address>
```

## Command Reference

| Command | Description |
|---------|-------------|
| `init` | Initialize a new stablecoin |
| `mint <recipient> <amount>` | Mint tokens to recipient |
| `burn <amount>` | Burn tokens from your account |
| `freeze <address>` | Freeze a token account |
| `thaw <address>` | Unfreeze a token account |
| `pause` | Pause all token operations |
| `unpause` | Resume all token operations |
| `status` | Show stablecoin status |
| `supply` | Show total supply |
| `balance [address]` | Check token balance |
| `blacklist add <address>` | Add to blacklist |
| `blacklist remove <address>` | Remove from blacklist |
| `blacklist check <address>` | Check blacklist status |
| `seize <account>` | Seize tokens from account |
| `minters add <address>` | Add a minter |
| `minters remove <address>` | Remove a minter |
| `minters info <address>` | Get minter info |
| `minters update-quota <address> <quota>` | Update minter quota |
| `roles update` | Update role assignments |
| `transfer-authority <address>` | Transfer master authority |
| `config` | Show/set CLI configuration |

## Options

Most commands support these common options:

- `--mint <address>` - Specify mint address (overrides saved config)
- `--rpc <url>` - RPC endpoint URL
- `--keypair <path>` - Path to keypair file

## Examples

### Full SSS-2 Workflow

```bash
# 1. Initialize compliant stablecoin
sss-token init --preset sss-2 --name "USD Coin" --symbol "USDC"

# 2. Add a minter
sss-token minters add GMx... --quota 1000000000

# 3. Mint tokens
sss-token mint 9Wz... 1000

# 4. Blacklist a bad actor
sss-token blacklist add Bad... --reason "Sanctions violation"

# 5. Seize their tokens
sss-token seize BadTokenAccount... --to TreasuryAccount...

# 6. Remove from blacklist after review
sss-token blacklist remove Bad...

# 7. Check status
sss-token status
```

## Development

```bash
# Run in development
npm run dev -- status

# Build
npm run build

# Run compiled
node dist/index.js status
```

## License

MIT