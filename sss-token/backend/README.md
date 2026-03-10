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
                    ┌────────────┴────────────┐
                    │        Indexer          │
                    │   (Event Listener)      │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
│    PostgreSQL   │     │      Redis      │     │    Solana RPC   │
│    (Events)     │     │   (Pub/Sub)     │     │   (Blockchain)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Services

### 1. Indexer
Listens for on-chain events and stores them in PostgreSQL for querying.

### 2. Mint/Burn Service
REST API for creating and managing mint/burn requests with idempotency support.

### 3. Compliance Service
Manages blacklist entries and OFAC sanctions screening.

### 4. Webhook Service
Delivers event notifications to registered webhook endpoints.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- pnpm

### Development Setup

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