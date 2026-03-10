/**
 * Shared constants for SSS Token Backend Services
 */

// SSS Token Program ID (default)
export const SSS_TOKEN_PROGRAM_ID = process.env.SSS_PROGRAM_ID || 'Hf1s4EvjS79S6kcHdKhaZHVQsnsjqMbJgBEFZfaGDPmw';

// Redis channel names
export const REDIS_CHANNELS = {
  EVENTS: 'sss:events',
  MINT_REQUESTS: 'sss:mint_requests',
  BURN_REQUESTS: 'sss:burn_requests',
  BLACKLIST_UPDATES: 'sss:blacklist_updates',
  WEBHOOK_DELIVERIES: 'sss:webhook_deliveries',
} as const;

// Redis key prefixes
export const REDIS_KEYS = {
  MINT_REQUEST: 'sss:mint_request',
  BURN_REQUEST: 'sss:burn_request',
  BLACKLIST_CACHE: 'sss:blacklist:cache',
  SANCTIONS_CACHE: 'sss:sanctions:cache',
  PROCESSED_SIGNATURE: 'sss:processed_sig',
  SERVICE_HEALTH: 'sss:health',
} as const;

// Event types emitted by the program
export const EVENT_TYPES = {
  // Token lifecycle
  INITIALIZE: 'initialize',
  MINT_TOKENS: 'mint_tokens',
  BURN_TOKENS: 'burn_tokens',
  
  // Account freeze
  FREEZE_TOKEN_ACCOUNT: 'freeze_token_account',
  THAW_TOKEN_ACCOUNT: 'thaw_token_account',
  
  // Pause
  PAUSE: 'pause',
  UNPAUSE: 'unpause',
  
  // Minter management
  ADD_MINTER: 'add_minter',
  REMOVE_MINTER: 'remove_minter',
  UPDATE_MINTER_QUOTA: 'update_minter_quota',
  
  // Compliance (SSS-2)
  ADD_TO_BLACKLIST: 'add_to_blacklist',
  REMOVE_FROM_BLACKLIST: 'remove_from_blacklist',
  SEIZE: 'seize',
  
  // Roles
  UPDATE_ROLES: 'update_roles',
  TRANSFER_AUTHORITY: 'transfer_authority',
} as const;

// Request statuses
export const REQUEST_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// Blacklist sources
export const BLACKLIST_SOURCES = {
  MANUAL: 'manual',
  OFAC: 'ofac',
  SYSTEM: 'system',
} as const;

// Webhook delivery statuses
export const WEBHOOK_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  RETRYING: 'retrying',
} as const;

// Default configuration values
export const DEFAULTS = {
  // Webhook settings
  WEBHOOK_TIMEOUT_MS: 30000,
  WEBHOOK_MAX_RETRIES: 5,
  WEBHOOK_RETRY_BASE_DELAY_MS: 1000,
  
  // Indexer settings
  INDEXER_POLL_INTERVAL_MS: 1000,
  INDEXER_MAX_SLOT_RANGE: 1000,
  
  // OFAC sync
  OFAC_SYNC_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
  
  // API pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // Request processing
  REQUEST_PROCESSING_TIMEOUT_MS: 60000,
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error codes
export const ERROR_CODES = {
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  
  // Mint/Burn
  REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
  REQUEST_ALREADY_PROCESSED: 'REQUEST_ALREADY_PROCESSED',
  DUPLICATE_IDEMPOTENCY_KEY: 'DUPLICATE_IDEMPOTENCY_KEY',
  MINT_FAILED: 'MINT_FAILED',
  BURN_FAILED: 'BURN_FAILED',
  
  // Compliance
  ADDRESS_BLACKLISTED: 'ADDRESS_BLACKLISTED',
  ADDRESS_NOT_BLACKLISTED: 'ADDRESS_NOT_BLACKLISTED',
  SANCTIONS_MATCH: 'SANCTIONS_MATCH',
  
  // Webhook
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  
  // Blockchain
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  RPC_ERROR: 'RPC_ERROR',
} as const;
