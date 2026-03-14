# SSS Token Frontend

A modern web interface for creating and managing Solana Stablecoin Standard (SSS) tokens.

## Features

- **Dashboard**: View stablecoin stats, supply, holder count, and feature status
- **Create Stablecoin**: Deploy new SSS-1 or SSS-2 compliant stablecoins
- **Admin Operations**: Mint, burn, freeze, thaw, blacklist, and seize tokens
- **Holders Management**: View and manage token holder accounts

## Tech Stack

- **Next.js 14** - React framework with App Router
- **Tailwind CSS** - Utility-first CSS with custom purple dark theme
- **Solana Wallet Adapter** - Wallet connection (Phantom, Solflare)
- **TypeScript** - Type-safe development

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- A Solana wallet (Phantom, Solflare)

### Installation

```bash
# Navigate to frontend directory
cd sss-token/frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file:

```env
# Solana RPC endpoint
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# Fetch mode: 'rpc' (direct) or 'indexer' (backend API)
NEXT_PUBLIC_FETCH_MODE=rpc

# Indexer URL (only needed if FETCH_MODE=indexer)
# NEXT_PUBLIC_INDEXER_URL=https://api.your-indexer.com
```

## Data Fetching Modes

The frontend supports two modes for fetching stablecoin data:

### RPC Mode (Default)

Fetches stablecoin data directly from Solana RPC using `getProgramAccounts`. This is the default mode and requires no backend infrastructure.

**How it works:**
1. Queries the SSS Token program for all `StablecoinConfig` accounts
2. Decodes the Borsh-encoded account data
3. Fetches mint supply for each stablecoin

**Pros:**
- No backend required
- Works immediately with just an RPC endpoint
- Real-time data from the blockchain

**Cons:**
- Slower for large numbers of stablecoins
- No holder count (requires scanning all token accounts)
- Rate limited by RPC provider

**Configuration:**
```env
NEXT_PUBLIC_FETCH_MODE=rpc
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

### Indexer Mode

Fetches stablecoin data from a backend indexer API. This mode is recommended for production deployments with high traffic.

**How it works:**
1. Queries the indexer REST API for stablecoin list
2. Indexer provides cached/aggregated data including holder counts
3. Faster response times for end users

**Pros:**
- Faster response times
- Includes holder count and aggregated stats
- Reduced RPC rate limit issues

**Cons:**
- Requires running the backend indexer service
- Data may have slight delay (depends on indexer sync)

**Configuration:**
```env
NEXT_PUBLIC_FETCH_MODE=indexer
NEXT_PUBLIC_INDEXER_URL=https://api.your-indexer.com
```

### Implementation Details

The fetching logic is organized in `src/lib/`:

| File | Purpose |
|------|---------|
| `constants.ts` | Program ID, discriminators, default RPC |
| `types.ts` | TypeScript interfaces |
| `fetch-rpc.ts` | Direct RPC fetching with Borsh decoding |
| `fetch-indexer.ts` | Backend API client |
| `fetch-stablecoins.ts` | Unified fetch with mode selection |

**React Hook:**
```typescript
import { useStablecoins } from '@/hooks/useStablecoins';

function MyComponent() {
  const { stablecoins, loading, error, refetch } = useStablecoins();
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <ul>
      {stablecoins.map(coin => (
        <li key={coin.mint}>{coin.name} - {coin.supply}</li>
      ))}
    </ul>
  );
}
```

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Dashboard
│   │   ├── create/page.tsx   # Create stablecoin wizard
│   │   ├── admin/page.tsx    # Admin operations
│   │   ├── holders/page.tsx  # Token holders table
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Global styles
│   └── components/
│       ├── WalletProvider.tsx # Wallet context
│       └── Navigation.tsx     # Nav bar
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Theme

The UI uses a purple dark theme with:

- **Primary**: Purple gradient (#8b5cf6 to #6d28d9)
- **Background**: Dark (#0f0f1f to #080813)
- **Accent colors**: Success (green), Warning (yellow), Error (red)
- **No borders**: Clean, borderless design with subtle glows

## Pages

### Dashboard (`/`)

- Overview statistics (supply, holders, status)
- Feature status indicators
- Quick action buttons
- Recent activity feed

### Create (`/create`)

- 3-step wizard: Preset → Details → Review
- SSS-1 (Minimal) and SSS-2 (Compliant) presets
- Custom configuration option
- Deployment simulation

### Admin (`/admin`)

- Mint/Burn tokens
- Freeze/Thaw accounts
- Blacklist management (SSS-2)
- Seize tokens (SSS-2)
- Pause/Unpause token

### Holders (`/holders`)

- Token holder table
- Search and filter functionality
- Status indicators (active, frozen, blacklisted)
- Quick actions per holder

## SDK Integration

The frontend is designed to integrate with the `@stbr/sss-token` SDK:

```typescript
import { SSSTokenClient } from '@stbr/sss-token';

const client = new SSSTokenClient({ provider });

// Create stablecoin
await client.initialize(mint, authority, {
  name: 'My Stablecoin',
  symbol: 'MYUSD',
  preset: 'sss-2',
});

// Mint tokens
await client.mintTokens(mint, authority, minter, recipient, { amount: 1000000 });
```

## Development Notes

- The current implementation uses mock data for demonstration
- For production, integrate with the actual SDK and indexer
- Holder data requires an indexer service (Helius, QuickNode)

## Building for Production

```bash
npm run build
npm start
```

## Live Demo

A live demo of the frontend is deployed on Vercel:

**🌐 https://solana-stablecoin-standard-amber.vercel.app/**

The demo connects to Solana devnet and showcases:
- Dashboard with stablecoin overview
- Create stablecoin wizard
- Admin operations panel
- Token holders table

## Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/solana-stablecoin-standard/tree/main/sss-token/frontend)

### Manual Deploy

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set environment variables:
   - `NEXT_PUBLIC_RPC_URL` - Your Solana RPC endpoint
4. Deploy!

### Environment Variables for Vercel

Set these in your Vercel project settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_RPC_URL` | Solana RPC endpoint | `https://api.devnet.solana.com` |

For production, use a dedicated RPC provider (Helius, QuickNode, Alchemy) for better reliability.

## Admin Operations Testing

The frontend includes a comprehensive admin operations panel for testing stablecoin management functions. This section explains how to set up and use the testing environment.

### Important Constraint: Localnet Only

⚠️ **Admin operations via the UI only work on localnet!**

The admin API routes load saved keypairs from the filesystem to sign transactions. This is only possible when:
- Running against a local Solana validator (`http://localhost:8899`)
- The test wallets have been set up using the setup script
- The SDK is built and available at `../sdk/dist`

**On devnet/mainnet**, you must:
- Connect your wallet with the correct authority (e.g., blacklister keypair imported into Phantom)
- Sign transactions client-side using the wallet adapter
- The server-side admin API routes will return errors

### Test Wallets Overview

The testing environment creates 7 keypairs for different roles:

| Keypair | Role | Used For |
|---------|------|----------|
| `authority` | Master Authority | Initialize, mint, update roles, freeze/thaw (SSS-1) |
| `blacklister` | Blacklister Role | Add/remove addresses from blacklist |
| `pauser` | Pauser Role | Pause/unpause token operations |
| `seizer` | Seizer Role | Seize tokens from frozen accounts, freeze/thaw (SSS-2) |
| `minter` | Minter with Quota | Mint new tokens (with quota tracking) |
| `user` | Test User | Regular token holder for testing |
| `treasury` | Treasury Account | Destination for seized tokens |

### Setting Up the Test Environment

#### Prerequisites

1. **Solana CLI** installed and configured
2. **Anchor CLI** installed (v0.30+)
3. **Node.js 18+** and npm/yarn
4. **Built SDK** (`cd sdk && npm run build`)

#### Step 1: Start Local Validator

```bash
# Terminal 1: Start the Solana test validator with programs deployed
cd sss-token
anchor localnet
```

**Alternative way:**
```bash
cd sss-token/sdk
./start-localnet.sh
```

This starts a local validator at `http://localhost:8899` with the SSS Token program deployed.

#### Step 2: Build the SDK

```bash
# Terminal 2: Build the SDK
cd sss-token/sdk
npm run build
```

The SDK must be built before running the setup script.

#### Step 3: Run Setup Script

```bash
# Terminal 2 (continued): Run the test wallets setup
cd sss-token
npm run setup:test-wallets
```

Or use the shell script:
```bash
./scripts/setup-test-env.sh
```

This script:
1. Generates keypairs for all 7 roles
2. Saves keypairs to `scripts/test-wallets/*.json`
3. Funds all accounts via airdrop (2 SOL each)
4. Creates a Token-2022 mint with PermanentDelegate extension
5. Initializes the stablecoin config (name: "Test Stablecoin", symbol: "TST")
6. Assigns roles (blacklister, pauser, seizer)
7. Adds minter with 1,000,000 token quota
8. Mints 10 TST to the test user
9. Saves configuration to `scripts/test-wallets/config.json`

#### Step 4: Configure Frontend

```bash
# Create/update .env.local
cd sss-token/frontend
echo "NEXT_PUBLIC_RPC_URL=http://localhost:8899" > .env.local
echo "NEXT_PUBLIC_FETCH_MODE=rpc" >> .env.local
```

#### Step 5: Start Frontend

```bash
cd sss-token/frontend
npm run dev
```

Open http://localhost:3000/admin

### Test Wallet Files Location

After setup, files are saved in `sss-token/scripts/test-wallets/`:

```
scripts/test-wallets/
├── config.json       # Configuration with mint address, all pubkeys
├── authority.json    # Master authority keypair (64-byte array)
├── blacklister.json  # Blacklister authority keypair
├── pauser.json       # Pauser authority keypair
├── seizer.json       # Seizer authority keypair
├── minter.json       # Minter keypair (has quota)
├── user.json         # Test user keypair
└── treasury.json     # Treasury keypair
```

### Configuration File Format

The `config.json` file contains:

```json
{
  "mint": "9KPRZsHGF4h3EiZQZ3jQ5amr3dEX5LAuMpdudGdSDGGd",
  "network": "http://localhost:8899",
  "createdAt": "2026-03-13T12:31:27.519Z",
  "keypairs": {
    "authority": "JBkkNP7FBh29aWTeQYkaR3jWgepXLhdcHrXhHSWEeFK6",
    "blacklister": "6yY26agokRieX9kTx2B8mW2mHmzrjpNnqWBMJBohfXta",
    "pauser": "AKRzrvZok4VosLFUWjg7KVuLYh1miViY5rcqLaFWHpE1",
    "seizer": "8HSGrdVQTTt4tU5RykqpQYCRwQuoQKL96MMYUKDj4Lwh",
    "minter": "F55if2ccVk3Z8ea7GagqGnQopCt7LyCewYwUmE9yj2bK",
    "user": "8RNBC2iCXJPDEE46VUWMgfsUG5jQiVEhBQdopRhrbCVh",
    "treasury": "4LqrtFfnjV7MSTgYz8zntjR3UZwNgSysA6SmHu8kZdMX"
  },
  "tokenAccount": {
    "user": "37XqkmkLPzuMh9WGiFguwbXWEUFyd6mzo2NzgK2QVSBW",
    "treasury": "3xeN86e4RapDpyddyTC3KjLeZ9y6B2ZYjLkCM7w8n48K"
  },
  "stablecoin": {
    "name": "Test Stablecoin",
    "symbol": "TST",
    "decimals": 6
  }
}
```

### Operations and Required Authorities

| Operation | Description | Authority Used | SSS Version |
|-----------|-------------|----------------|-------------|
| Mint | Create new tokens | authority + minter | SSS-1/SSS-2 |
| Burn | Destroy tokens | user (token owner) | SSS-1/SSS-2 |
| Freeze | Freeze token account | authority (SSS-1) or seizer (SSS-2) | SSS-1/SSS-2 |
| Thaw | Unfreeze token account | authority (SSS-1) or seizer (SSS-2) | SSS-1/SSS-2 |
| Blacklist Add | Add address to blacklist | blacklister | SSS-2 only |
| Blacklist Remove | Remove from blacklist | blacklister | SSS-2 only |
| Seize | Seize tokens from frozen account | seizer | SSS-2 only |
| Pause | Pause all token operations | pauser | SSS-1/SSS-2 |
| Unpause | Resume token operations | pauser | SSS-1/SSS-2 |

### SSS-1 vs SSS-2 Freeze/Thaw

The admin API automatically detects the mint type:

- **SSS-1 mints**: Freeze authority is a keypair → uses `freezeTokenAccount()` with authority keypair
- **SSS-2 mints**: Freeze authority is a PDA → uses `freezeTokenAccountPda()` with seizer keypair

This is handled automatically by the API route by checking if the mint's freeze authority matches the PDA.

### Testing Workflow Examples

#### 1. Test Freeze/Thaw

```
1. Select "Freeze Account" operation
2. Click "Fill User" to auto-populate user's wallet address
3. Click "Execute Freeze Account"
4. Verify transaction succeeds
5. Select "Thaw Account" operation
6. Click "Fill User" again
7. Execute to unfreeze
```

#### 2. Test Blacklist (SSS-2 only)

```
1. Select "Add to Blacklist"
2. Enter user wallet address (or use Fill User)
3. Enter reason: "Test blacklist"
4. Execute
5. Verify address is blacklisted
6. Select "Remove from Blacklist" to undo
```

#### 3. Test Seize (SSS-2 only)

```
1. First freeze the target account (see Freeze workflow)
2. Select "Seize Tokens"
3. Fill source: user wallet address
4. Fill destination: treasury wallet address
5. Enter amount (e.g., 5.0)
6. Execute
7. Tokens move from user to treasury
```

#### 4. Test Pause/Unpause

```
1. Select "Pause Token"
2. No address needed - just click Execute
3. All transfers blocked
4. Select "Unpause Token" to resume
```

#### 5. Test Mint

```
1. Select "Mint Tokens"
2. Enter recipient wallet address
3. Enter amount (e.g., 100)
4. Execute
5. New tokens created and sent to recipient
```

### Importing Test Wallets into Browser Wallets

To test with Phantom or Solflare instead of the server-side API:

1. Open wallet settings
2. Choose "Import existing wallet" or "Add Account"
3. Select "Import Private Key"
4. Copy the array from the JSON file, e.g.:
   ```json
   [123, 45, 67, 89, 12, 34, 56, 78, ...]
   ```
5. Paste and import

**Note:** Some wallets accept base58 format. Convert using:
```bash
# If you have solana-cli installed
solana-keygen pubkey <(echo "[123,45,...]" | jq -r @json) 
```

### API Reference

#### GET /api/admin

Returns test configuration if available:

**Response:**
```json
{
  "success": true,
  "config": {
    "mint": "9KPRZ...",
    "keypairs": {
      "authority": "JBkkN...",
      "blacklister": "6yY26...",
      ...
    },
    "tokenAccounts": {
      "user": "37Xqk...",
      "treasury": "3xeN8..."
    }
  }
}
```

#### POST /api/admin

Execute an admin operation:

**Request:**
```json
{
  "operation": "freeze",
  "mint": "9KPRZsHGF4h3EiZQZ3jQ5amr3dEX5LAuMpdudGdSDGGd",
  "targetAddress": "8RNBC2iCXJPDEE46VUWMgfsUG5jQiVEhBQdopRhrbCVh"
}
```

**Response:**
```json
{
  "success": true,
  "signature": "5XyF...",
  "operation": "freeze",
  "authority": "authority",
  "explorerUrl": "https://explorer.solana.com/tx/5XyF...?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899"
}
```

### Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "No test configuration found" | Setup script not run | Run `npm run setup:test-wallets` |
| "Failed to load keypair" | Keypair file missing | Re-run setup script |
| "SDK not built" | SDK dist/ missing | `cd sdk && npm run build` |
| "Custom program error: 6000" | Unauthorized | Check correct authority for operation |
| "Custom program error: 6004" | Token paused | Unpause token first |
| "Account frozen" errors | Target account frozen | Thaw account first |
| Airdrop fails | Local validator not running | Start validator with `anchor localnet` |

### Security Warning

⚠️ **NEVER use test keypairs in production!**

- Keypairs are stored in plain JSON files
- Private keys are visible to anyone with file access
- Only use for local development testing

For production deployments:
- Use hardware wallets (Ledger, Trezor)
- Implement HSM or KMS (AWS KMS, GCP KMS)
- Use multi-signature wallets for critical operations
- Never commit keypairs to version control

## Next Steps: SDK Deployment to NPM

The `@stbr/sss-token` SDK is ready for npm publication. Here's the roadmap:

### Current Status

The SDK is fully functional and located at `sss-token/sdk/`:
- Package name: `@stbr/sss-token`
- Version: `1.0.0`
- Main entry: `dist/index.js`
- Types: `dist/index.d.ts`

### Publishing to NPM

```bash
# 1. Build the SDK
cd sss-token/sdk
npm run build

# 2. Login to npm (first time)
npm login

# 3. Publish (scoped packages need --access public)
npm publish --access public
```

### Pre-publish Checklist

- [ ] Update version in `package.json`
- [ ] Run tests: `npm test`
- [ ] Build: `npm run build`
- [ ] Verify dist/ contents
- [ ] Update README.md with usage examples
- [ ] Add CHANGELOG.md entry

### Using the Published SDK

After publishing, users can install via:

```bash
npm install @stbr/sss-token
# or
yarn add @stbr/sss-token
```

Then import:

```typescript
import { SSSTokenClient, findConfigPDA } from '@stbr/sss-token';

const client = new SSSTokenClient({ provider });
```

### Version Strategy

Follow semantic versioning:
- **Patch (1.0.x)**: Bug fixes, minor improvements
- **Minor (1.x.0)**: New features, backward compatible
- **Major (x.0.0)**: Breaking changes

### CI/CD Integration

Consider adding GitHub Actions for automated publishing:

```yaml
# .github/workflows/publish-sdk.yml
name: Publish SDK to NPM
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: cd sss-token/sdk && npm ci && npm run build
      - run: cd sss-token/sdk && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{secrets.NPM_TOKEN}}
```

## License

MIT
