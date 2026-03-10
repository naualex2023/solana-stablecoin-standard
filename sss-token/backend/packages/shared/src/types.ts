/**
 * Shared type definitions for SSS Token Backend Services
 */

import { z } from 'zod';

// ============================================
// Event Types
// ============================================

export const InstructionTypeSchema = z.enum([
  'initialize',
  'mint_tokens',
  'burn_tokens',
  'freeze_token_account',
  'thaw_token_account',
  'pause',
  'unpause',
  'add_minter',
  'remove_minter',
  'update_minter_quota',
  'add_to_blacklist',
  'remove_from_blacklist',
  'seize',
  'update_roles',
  'transfer_authority',
]);

export type InstructionType = z.infer<typeof InstructionTypeSchema>;

export interface Event {
  id: number;
  signature: string;
  slot: number;
  blockTime: Date;
  instructionType: InstructionType;
  mintAddress: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface EventData {
  // Initialize
  initialize?: {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    enablePermanentDelegate: boolean;
    enableTransferHook: boolean;
    defaultAccountFrozen: boolean;
  };
  // Mint
  mint_tokens?: {
    amount: string;
    recipient: string;
    minter: string;
  };
  // Burn
  burn_tokens?: {
    amount: string;
    burner: string;
  };
  // Freeze/Thaw
  freeze_token_account?: {
    tokenAccount: string;
  };
  thaw_token_account?: {
    tokenAccount: string;
  };
  // Pause/Unpause
  pause?: {};
  unpause?: {};
  // Minter management
  add_minter?: {
    minter: string;
    quota: string;
  };
  remove_minter?: {
    minter: string;
  };
  update_minter_quota?: {
    minter: string;
    newQuota: string;
  };
  // Blacklist
  add_to_blacklist?: {
    user: string;
    reason: string;
  };
  remove_from_blacklist?: {
    user: string;
  };
  // Seize
  seize?: {
    sourceToken: string;
    destToken: string;
    amount: string;
  };
  // Roles
  update_roles?: {
    newBlacklister: string;
    newPauser: string;
    newSeizer: string;
  };
  // Authority transfer
  transfer_authority?: {
    newMasterAuthority: string;
  };
}

// ============================================
// Mint/Burn Request Types
// ============================================

export const RequestTypeSchema = z.enum(['mint', 'burn']);
export type RequestType = z.infer<typeof RequestTypeSchema>;

export const RequestStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

export interface MintBurnRequest {
  id: string;
  type: RequestType;
  status: RequestStatus;
  mintAddress: string;
  amount: bigint;
  recipient: string | null;
  idempotencyKey: string | null;
  txSignature: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateMintRequestSchema = z.object({
  mintAddress: z.string().min(32).max(44),
  amount: z.string().regex(/^\d+$/),
  recipient: z.string().min(32).max(44),
  idempotencyKey: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateBurnRequestSchema = z.object({
  mintAddress: z.string().min(32).max(44),
  amount: z.string().regex(/^\d+$/),
  idempotencyKey: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateMintRequest = z.infer<typeof CreateMintRequestSchema>;
export type CreateBurnRequest = z.infer<typeof CreateBurnRequestSchema>;

// ============================================
// Blacklist Types
// ============================================

export const BlacklistSourceSchema = z.enum(['manual', 'ofac', 'system']);
export type BlacklistSource = z.infer<typeof BlacklistSourceSchema>;

export interface BlacklistEntry {
  id: number;
  address: string;
  reason: string;
  source: BlacklistSource;
  txSignature: string | null;
  onChain: boolean;
  addedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AddToBlacklistSchema = z.object({
  address: z.string().min(32).max(44),
  reason: z.string().min(1).max(500),
  syncOnChain: z.boolean().optional().default(false),
});

export type AddToBlacklist = z.infer<typeof AddToBlacklistSchema>;

// ============================================
// OFAC Sanctions Types
// ============================================

export const OFACEntityTypeSchema = z.enum(['individual', 'entity', 'vessel', 'aircraft']);
export type OFACEntityType = z.infer<typeof OFACEntityTypeSchema>;

export interface OFACSanction {
  id: number;
  entityId: string;
  type: OFACEntityType;
  name: string;
  program: string | null;
  country: string | null;
  addresses: OFACAddress[] | null;
  aliases: string[] | null;
  rawData: Record<string, unknown> | null;
  syncedAt: Date;
}

export interface OFACAddress {
  type: string;
  address: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface SanctionsSyncStatus {
  id: number;
  source: string;
  lastSyncAt: Date | null;
  lastSyncCount: number | null;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  errorMessage: string | null;
  updatedAt: Date;
}

// ============================================
// Webhook Types
// ============================================

export interface WebhookSubscription {
  id: string;
  name: string | null;
  url: string;
  secret: string;
  eventTypes: string[];
  mintAddresses: string[] | null;
  active: boolean;
  headers: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateWebhookSubscriptionSchema = z.object({
  name: z.string().max(100).optional(),
  url: z.string().url().max(500),
  eventTypes: z.array(z.string()).min(1),
  mintAddresses: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
});

export type CreateWebhookSubscription = z.infer<typeof CreateWebhookSubscriptionSchema>;

export const WebhookDeliveryStatusSchema = z.enum(['pending', 'sent', 'failed', 'retrying']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: number;
  status: WebhookDeliveryStatus;
  httpStatus: number | null;
  requestHeaders: Record<string, string> | null;
  requestBody: Record<string, unknown> | null;
  responseBody: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

// ============================================
// Audit Log Types
// ============================================

export interface AuditLogEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Configuration Types
// ============================================

export interface ServiceConfig {
  port: number;
  solanaRpcUrl: string;
  solanaWsUrl?: string;
  sssProgramId: string;
  databaseUrl: string;
  redisUrl: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

export interface MintBurnServiceConfig extends ServiceConfig {
  keypairPath: string;
}

export interface ComplianceServiceConfig extends ServiceConfig {
  keypairPath: string;
  ofacApiUrl: string;
  ofacSyncInterval: number;
}

export interface WebhookServiceConfig extends ServiceConfig {
  webhookTimeout: number;
  webhookMaxRetries: number;
  webhookRetryBaseDelay: number;
}

export interface IndexerConfig extends ServiceConfig {
  startSlot?: number;
}
</task_progress>
</write_to_file>