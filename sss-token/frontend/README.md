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
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
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

## License

MIT
