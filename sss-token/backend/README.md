# SSS Token Backend Services

Backend services for the SSS Token standard, providing REST APIs for mint/burn operations, compliance management, and webhook notifications.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mint/Burn     │     │  Compliance     │     │    Webhook      │
│    Service      │     │    Service      │     │    Service      │
│   (Port 3001)   │     │   (Port 3002)   │     │   (Port 3003)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
│    Indexer      │     │   Indexer API   │     │    Solana RPC   │
│ (WebSocket)     │     │   (Port 3004)   │     │   (Blockchain)  │
│ Events → DB     │     │   REST Queries  │     │                 │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────┴────────┐     ┌────────┴────────┐
│    PostgreSQL   │     │      Redis      │
│    (Events)     │     │   (Pub/Sub)     │
└─────────────────┘     └─────────────────┘
```

## Services

### 1. Indexer
WebSocket listener that captures on-chain events from the SSS Token program and stores them in PostgreSQL. Runs in background, no HTTP port.

### 2. Indexer API
REST API for querying indexed events and statistics. Port 3004.

### 3. Mint/Burn Service
REST API for creating and managing mint/burn requests with idempotency support. Port 3001.

### 4. Compliance Service
Manages blacklist entries and OFAC sanctions screening. Port 3002.

### 5. Webhook Service
Delivers event notifications to registered webhook endpoints. Port 3003.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- pnpm

### Option 1: Devnet Testing (Recommended for Testing)

Use the devnet testing script to connect to Solana Devnet:

```bash
# Start all services configured for devnet
./start-devnet.sh

# Or run in background
./start-devnet.sh --detach

# Check status
./start-devnet.sh --status

# View logs
./start-devnet.sh --logs indexer

# Stop all services
./start-devnet.sh --stop
```

The script will:
1. Start PostgreSQL and Redis via Docker
2. Configure environment for Solana Devnet
3. Build and start all backend services
4. Services connect to `https://api.devnet.solana.com` by default

### Option 2: Local Development (Local Validator)

For development with a local Solana validator:

1. Copy environment variables:
```bash
cp .env.example .env
```

2. Start infrastructure:
```bash
docker-compose up -d postgres redis
```

3. Install dependencies:
```bash
pnpm install
```

4. Build shared package:
```bash
cd packages/shared && pnpm build
```

5. Start services:
```bash
pnpm dev
```

Or use the full development script:
```bash
./start-dev.sh
```

### Production Deployment

```bash
docker-compose up -d
```

## API Endpoints

### Mint/Burn Service (Port 3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/mint-requests` | POST | Create mint request |
| `/api/v1/mint-requests/:id` | GET | Get mint request status |
| `/api/v1/burn-requests` | POST | Create burn request |
| `/api/v1/burn-requests/:id` | GET | Get burn request status |
| `/health` | GET | Health check |

### Compliance Service (Port 3002)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/blacklist` | GET | List blacklist entries |
| `/api/v1/blacklist` | POST | Add address to blacklist |
| `/api/v1/blacklist/:address` | DELETE | Remove from blacklist |
| `/api/v1/screening/check/:address` | GET | Check if address is sanctioned |
| `/api/v1/sanctions/sync` | POST | Trigger OFAC sync |
| `/health` | GET | Health check |

### Webhook Service (Port 3003)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/subscriptions` | GET | List webhook subscriptions |
| `/api/v1/subscriptions` | POST | Create subscription |
| `/api/v1/subscriptions/:id` | DELETE | Delete subscription |
| `/api/v1/deliveries` | GET | List webhook deliveries |
| `/health` | GET | Health check |

### Indexer API (Port 3004)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | Get recent events (paginated) |
| `/events/mint/:mintAddress` | GET | Get events by mint address |
| `/events/type/:type` | GET | Get events by instruction type |
| `/stats` | GET | Get indexing statistics |
| `/stablecoins` | GET | Get list of indexed stablecoins |
| `/health` | GET | Health check |

**Event Types:** Initialize, UpdateRoles, AddMinter, RemoveMinter, UpdateMinterQuota, MintTokens, BurnTokens, Pause, Unpause, AddToBlacklist, RemoveFromBlacklist, FreezeTokenAccount, ThawTokenAccount, FreezeTokenAccountPda, Seize, TransferAuthority

**Example Responses:**

```bash
# Get stats
curl http://localhost:3004/stats
# {"success":true,"data":{"totalEvents":43,"eventsByType":{...},"totalStablecoins":9,"latestSlot":"448"}}

# Get recent events
curl http://localhost:3004/events?limit=5
# {"success":true,"data":[...],"pagination":{"total":43,"limit":5,"offset":0,"hasMore":true}}

# Get events by mint
curl http://localhost:3004/events/mint/ET969JEvTdWpC68J9zig2fVPawFCaiCu8vaF9B8qc7Tt

# Get mint events only
curl http://localhost:3004/events/type/MintTokens
```

## Configuration

Environment variables are defined in `.env.example`:

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_URL` | Solana RPC endpoint | Required |
| `SSS_PROGRAM_ID` | SSS Token program ID | `Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | Required |
| `LOG_LEVEL` | Logging level | `info` |

## Development

### Build
```bash
pnpm build
```

### Test
```bash
pnpm test
```

### Lint
```bash
pnpm lint
```

## License

MIT
</task_progress>
</write_to_file>