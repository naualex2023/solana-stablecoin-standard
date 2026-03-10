/**
 * Shared type definitions for SSS Token Backend Services
 */
import { z } from 'zod';
export declare const InstructionTypeSchema: z.ZodEnum<["initialize", "mint_tokens", "burn_tokens", "freeze_token_account", "thaw_token_account", "pause", "unpause", "add_minter", "remove_minter", "update_minter_quota", "add_to_blacklist", "remove_from_blacklist", "seize", "update_roles", "transfer_authority"]>;
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
    initialize?: {
        name: string;
        symbol: string;
        uri: string;
        decimals: number;
        enablePermanentDelegate: boolean;
        enableTransferHook: boolean;
        defaultAccountFrozen: boolean;
    };
    mint_tokens?: {
        amount: string;
        recipient: string;
        minter: string;
    };
    burn_tokens?: {
        amount: string;
        burner: string;
    };
    freeze_token_account?: {
        tokenAccount: string;
    };
    thaw_token_account?: {
        tokenAccount: string;
    };
    pause?: {};
    unpause?: {};
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
    add_to_blacklist?: {
        user: string;
        reason: string;
    };
    remove_from_blacklist?: {
        user: string;
    };
    seize?: {
        sourceToken: string;
        destToken: string;
        amount: string;
    };
    update_roles?: {
        newBlacklister: string;
        newPauser: string;
        newSeizer: string;
    };
    transfer_authority?: {
        newMasterAuthority: string;
    };
}
export declare const RequestTypeSchema: z.ZodEnum<["mint", "burn"]>;
export type RequestType = z.infer<typeof RequestTypeSchema>;
export declare const RequestStatusSchema: z.ZodEnum<["pending", "processing", "completed", "failed", "cancelled"]>;
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
export declare const CreateMintRequestSchema: z.ZodObject<{
    mintAddress: z.ZodString;
    amount: z.ZodString;
    recipient: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    mintAddress: string;
    amount: string;
    recipient: string;
    idempotencyKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    mintAddress: string;
    amount: string;
    recipient: string;
    idempotencyKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const CreateBurnRequestSchema: z.ZodObject<{
    mintAddress: z.ZodString;
    amount: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    mintAddress: string;
    amount: string;
    idempotencyKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    mintAddress: string;
    amount: string;
    idempotencyKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type CreateMintRequest = z.infer<typeof CreateMintRequestSchema>;
export type CreateBurnRequest = z.infer<typeof CreateBurnRequestSchema>;
export declare const BlacklistSourceSchema: z.ZodEnum<["manual", "ofac", "system"]>;
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
export declare const AddToBlacklistSchema: z.ZodObject<{
    address: z.ZodString;
    reason: z.ZodString;
    syncOnChain: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    address: string;
    reason: string;
    syncOnChain: boolean;
}, {
    address: string;
    reason: string;
    syncOnChain?: boolean | undefined;
}>;
export type AddToBlacklist = z.infer<typeof AddToBlacklistSchema>;
export declare const OFACEntityTypeSchema: z.ZodEnum<["individual", "entity", "vessel", "aircraft"]>;
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
export declare const CreateWebhookSubscriptionSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    url: z.ZodString;
    eventTypes: z.ZodArray<z.ZodString, "many">;
    mintAddresses: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    url: string;
    eventTypes: string[];
    name?: string | undefined;
    mintAddresses?: string[] | undefined;
    headers?: Record<string, string> | undefined;
}, {
    url: string;
    eventTypes: string[];
    name?: string | undefined;
    mintAddresses?: string[] | undefined;
    headers?: Record<string, string> | undefined;
}>;
export type CreateWebhookSubscription = z.infer<typeof CreateWebhookSubscriptionSchema>;
export declare const WebhookDeliveryStatusSchema: z.ZodEnum<["pending", "sent", "failed", "retrying"]>;
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
//# sourceMappingURL=types.d.ts.map