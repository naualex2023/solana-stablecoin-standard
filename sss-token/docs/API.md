# SSS Token Backend API Reference

Complete API reference for the SSS Token backend services.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [Common Response Format](#common-response-format)
- [Mint & Burn Service](#mint--burn-service)
- [Compliance Service](#compliance-service)
- [Webhook Service](#webhook-service)
- [Indexer Service](#indexer-service)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

## Overview

The SSS Token backend consists of microservices:

| Service | Port | Purpose |
|---------|------|---------|
| mint-burn-service | 3001 | Mint/burn operations |
| compliance-service | 3002 | Compliance operations |
| webhook-service | 3003 | Webhook delivery |
| indexer | - | WebSocket listener for on-chain events |
| indexer-api | 3004 | REST API for querying indexed data |

## Authentication

All API requests require authentication via JWT bearer token:

```http
Authorization: Bearer <jwt_token>
```

### Obtain Token

```http
POST /auth/token
Content-Type: application/json

{
  "client_id": "your_client_id",
  "client_secret": "your_client_secret"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:3001` |
| Staging | `https://api-staging.stablecoin.example.com` |
| Production | `https://api.stablecoin.example.com` |

## Common Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_QUOTA",
    "message": "Minter quota exceeded",
    "details": {
      "quota": 1000000,
      "requested": 2000000
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

## Mint & Burn Service

Port: 3001

### Mint Tokens

Mint new tokens to a recipient.

```http
POST /api/v1/mint
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "recipient": "RECIPIENT_TOKEN_ACCOUNT",
  "amount": 1000000,
  "minter": "MINTER_ADDRESS",
  "idempotency_key": "unique_request_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_signature": "5Kt...",
    "slot": 123456789,
    "amount": 1000000,
    "recipient": "RECIPIENT_TOKEN_ACCOUNT",
    "new_balance": 1000000
  }
}
```

**Errors:**
- `INSUFFICIENT_QUOTA` - Minter quota exceeded
- `INVALID_RECIPIENT` - Invalid recipient address
- `PAUSED` - Stablecoin is paused
- `BLACKLISTED` - Recipient is blacklisted

### Burn Tokens

Burn tokens from an account.

```http
POST /api/v1/burn
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "token_account": "TOKEN_ACCOUNT",
  "amount": 500000,
  "owner": "OWNER_ADDRESS",
  "idempotency_key": "unique_request_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_signature": "3Bx...",
    "slot": 123456790,
    "amount": 500000,
    "new_balance": 500000
  }
}
```

### Get Minter Info

```http
GET /api/v1/minters/:minter_address
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authority": "MINTER_ADDRESS",
    "quota": 1000000000,
    "minted": 500000000,
    "remaining": 500000000
  }
}
```

### Add Minter

```http
POST /api/v1/minters
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "minter": "NEW_MINTER_ADDRESS",
  "quota": 1000000000
}
```

### Update Minter Quota

```http
PATCH /api/v1/minters/:minter_address
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "quota": 2000000000
}
```

### Remove Minter

```http
DELETE /api/v1/minters/:minter_address?mint=MINT_ADDRESS
Authorization: Bearer <token>
```

## Compliance Service

Port: 3002

### Blacklist Operations

#### Add to Blacklist

```http
POST /api/v1/blacklist
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "address": "ADDRESS_TO_BLACKLIST",
  "reason": "OFAC SDN list match",
  "source": "OFAC"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_signature": "2Mp...",
    "address": "ADDRESS_TO_BLACKLIST",
    "reason": "OFAC SDN list match",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Remove from Blacklist

```http
DELETE /api/v1/blacklist/:address
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "approval_id": "APPROVAL_TICKET_ID"
}
```

#### Check Blacklist Status

```http
GET /api/v1/blacklist/:address?mint=MINT_ADDRESS
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "ADDRESS",
    "is_blacklisted": true,
    "reason": "OFAC SDN list match",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Get Blacklist Entries

```http
GET /api/v1/blacklist?mint=MINT_ADDRESS&page=1&limit=100
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "address": "ADDRESS_1",
        "reason": "OFAC SDN",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 100,
      "total": 150
    }
  }
}
```

### Freeze Operations

#### Freeze Account

```http
POST /api/v1/freeze
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "token_account": "TOKEN_ACCOUNT_TO_FREEZE",
  "reason": "Suspicious activity"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_signature": "7Kp...",
    "token_account": "TOKEN_ACCOUNT",
    "frozen": true,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

#### Thaw Account

```http
POST /api/v1/thaw
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "token_account": "TOKEN_ACCOUNT_TO_THAW",
  "approval_id": "APPROVAL_TICKET_ID"
}
```

#### Get Frozen Accounts

```http
GET /api/v1/frozen?mint=MINT_ADDRESS&page=1&limit=100
Authorization: Bearer <token>
```

### Seizure Operations

#### Seize Tokens

```http
POST /api/v1/seize
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "source_token_account": "SOURCE_ACCOUNT",
  "destination_token_account": "TREASURY_ACCOUNT",
  "amount": 1000000,
  "legal_order_id": "COURT-2024-001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction_signature": "9Lm...",
    "source": "SOURCE_ACCOUNT",
    "destination": "TREASURY_ACCOUNT",
    "amount": 1000000,
    "legal_order_id": "COURT-2024-001",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Pause Operations

#### Pause Stablecoin

```http
POST /api/v1/pause
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "reason": "Security incident"
}
```

#### Unpause Stablecoin

```http
POST /api/v1/unpause
Content-Type: application/json
Authorization: Bearer <token>

{
  "mint": "MINT_ADDRESS",
  "incident_id": "INCIDENT_ID"
}
```

#### Get Pause Status

```http
GET /api/v1/pause/status?mint=MINT_ADDRESS
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paused": false,
    "last_pause": "2024-01-10T10:30:00Z",
    "last_unpause": "2024-01-10T12:00:00Z"
  }
}
```

## Webhook Service

Port: 3003

### Webhook Events

The webhook service delivers events to registered endpoints.

#### Event Types

| Event | Description |
|-------|-------------|
| `mint` | Tokens minted |
| `burn` | Tokens burned |
| `freeze` | Account frozen |
| `thaw` | Account thawed |
| `blacklist.add` | Address blacklisted |
| `blacklist.remove` | Address removed from blacklist |
| `seize` | Tokens seized |
| `pause` | Stablecoin paused |
| `unpause` | Stablecoin unpaused |
| `transfer` | Token transfer (if indexed) |

#### Event Payload

```json
{
  "event_id": "evt_abc123",
  "event_type": "mint",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "mint": "MINT_ADDRESS",
    "amount": 1000000,
    "recipient": "RECIPIENT_ADDRESS",
    "transaction_signature": "5Kt..."
  },
  "signature": "sha256=..."
}
```

### Register Webhook

```http
POST /api/v1/webhooks
Content-Type: application/json
Authorization: Bearer <token>

{
  "url": "https://your-service.com/webhooks",
  "events": ["mint", "burn", "freeze", "seize"],
  "secret": "your_webhook_secret"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "webhook_id": "wh_xyz789",
    "url": "https://your-service.com/webhooks",
    "events": ["mint", "burn", "freeze", "seize"],
    "active": true
  }
}
```

### List Webhooks

```http
GET /api/v1/webhooks
Authorization: Bearer <token>
```

### Delete Webhook

```http
DELETE /api/v1/webhooks/:webhook_id
Authorization: Bearer <token>
```

### Webhook Verification

Verify webhook signatures:

```typescript
import crypto from 'crypto';

function verifyWebhook(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === `sha256=${expectedSignature}`;
}
```

## Indexer Service

The Indexer consists of two components:
- **Indexer** - WebSocket listener that captures on-chain events and stores them in PostgreSQL
- **Indexer API** - REST API for querying indexed data (Port: 3004)

### Get Events

```http
GET /events?limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 43,
      "signature": "5Yi91ugfvsUJuSNp6Hin8yQ4A8epRxtpC4FeKpWsrBodbE3P3p4uAfuYuZZ75eEssTw9KCzC7HEQHviybCxsxGEf",
      "slot": "448",
      "block_time": "2024-01-15T10:30:00.000Z",
      "instruction_type": "Seize",
      "mint_address": "MINT_ADDRESS",
      "data": {
        "fee": 10000,
        "logs": ["..."],
        "success": true,
        "accounts": ["..."],
        "instruction": { "raw": "...", "discriminator": "..." }
      },
      "created_at": "2024-01-15T10:30:01.540Z"
    }
  ],
  "pagination": {
    "total": 43,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

### Get Events by Mint

```http
GET /events/mint/:mintAddress?limit=10&offset=0
```

### Get Events by Type

```http
GET /events/type/:instructionType?limit=10&offset=0
```

**Available Types:** Initialize, UpdateRoles, AddMinter, RemoveMinter, UpdateMinterQuota, MintTokens, BurnTokens, Pause, Unpause, AddToBlacklist, RemoveFromBlacklist, FreezeTokenAccount, ThawTokenAccount, FreezeTokenAccountPda, Seize, TransferAuthority

### Get Statistics

```http
GET /stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEvents": 43,
    "eventsByType": {
      "Initialize": 9,
      "UpdateRoles": 5,
      "AddMinter": 5,
      "MintTokens": 4,
      "AddToBlacklist": 3,
      "Unpause": 2,
      "FreezeTokenAccount": 2,
      "Pause": 2,
      "RemoveFromBlacklist": 2,
      "BurnTokens": 2,
      "TransferAuthority": 2,
      "ThawTokenAccount": 1,
      "RemoveMinter": 1,
      "Seize": 1,
      "FreezeTokenAccountPda": 1,
      "UpdateMinterQuota": 1
    },
    "totalStablecoins": 9,
    "latestSlot": "448"
  }
}
```

### Get Stablecoins List

```http
GET /stablecoins
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "mint_address": "MINT_ADDRESS",
      "event_count": 15,
      "last_event": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Error Handling

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `INSUFFICIENT_QUOTA` | 400 | Minter quota exceeded |
| `PAUSED` | 400 | Stablecoin is paused |
| `BLACKLISTED` | 403 | Address is blacklisted |
| `FROZEN` | 403 | Account is frozen |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |

### Error Response Example

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_QUOTA",
    "message": "Minter quota exceeded",
    "details": {
      "quota": 1000000,
      "requested": 2000000,
      "remaining": 0
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

## Rate Limiting

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/v1/mint` | 100 | 1 minute |
| `/api/v1/burn` | 100 | 1 minute |
| `/api/v1/blacklist` | 50 | 1 minute |
| `/api/v1/freeze` | 50 | 1 minute |
| `/api/v1/seize` | 10 | 1 minute |
| Other | 1000 | 1 minute |

### Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312860
```

### Rate Limit Exceeded

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 100,
      "reset_at": "2024-01-15T10:35:00Z"
    }
  }
}
```

## SDK Client Example

```typescript
import { SSSTokenClient } from '@stbr/sss-token';

const client = new SSSTokenClient({
  baseUrl: 'https://api.stablecoin.example.com',
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
});

// Mint tokens
const mintResult = await client.mint({
  mint: 'MINT_ADDRESS',
  recipient: 'RECIPIENT_ADDRESS',
  amount: 1000000,
  minter: 'MINTER_ADDRESS',
});

console.log('Minted:', mintResult.transaction_signature);

// Check blacklist
const blacklistStatus = await client.checkBlacklist('ADDRESS');
if (blacklistStatus.is_blacklisted) {
  console.log('Blacklisted:', blacklistStatus.reason);
}

// Register webhook
await client.registerWebhook({
  url: 'https://your-service.com/webhooks',
  events: ['mint', 'burn', 'freeze', 'seize'],
});
```

## OpenAPI Specification

Full OpenAPI specification available at:

- Development: `http://localhost:3001/docs`
- Production: `https://api.stablecoin.example.com/docs`

## References

- [SDK Documentation](./SDK.md)
- [Operations Guide](./OPERATIONS.md)
- [Compliance Guide](./COMPLIANCE.md)