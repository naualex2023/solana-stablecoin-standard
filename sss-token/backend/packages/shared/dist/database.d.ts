/**
 * PostgreSQL database client for SSS Token Backend Services
 */
import type { Pool as PoolType, PoolClient, QueryResult, QueryResultRow } from 'pg';
interface DatabaseConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
}
/**
 * Initialize the database connection pool
 */
export declare function initDatabase(config?: DatabaseConfig): PoolType;
/**
 * Get the database pool (initializes if needed)
 */
export declare function getPool(): PoolType;
/**
 * Execute a query
 */
export declare function query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
/**
 * Get a client from the pool for transactions
 */
export declare function getClient(): Promise<PoolClient>;
/**
 * Execute a transaction
 */
export declare function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
/**
 * Close the database connection pool
 */
export declare function closeDatabase(): Promise<void>;
export interface CreateEventParams {
    signature: string;
    slot: number;
    blockTime: Date;
    instructionType: string;
    mintAddress: string;
    data: Record<string, unknown>;
}
export declare function createEvent(params: CreateEventParams): Promise<number>;
export declare function getEventBySignature(signature: string): Promise<any>;
export declare function getEventsByMint(mintAddress: string, limit?: number, offset?: number): Promise<any[]>;
export declare function getLatestEventSlot(): Promise<number | null>;
export interface CreateMintBurnRequestParams {
    type: 'mint' | 'burn';
    mintAddress: string;
    amount: string;
    recipient?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
}
export declare function createMintBurnRequest(params: CreateMintBurnRequestParams): Promise<string>;
export declare function getMintBurnRequestById(id: string): Promise<any>;
export declare function getMintBurnRequestByIdempotencyKey(key: string): Promise<any>;
export declare function updateMintBurnRequestStatus(id: string, status: string, txSignature?: string, errorMessage?: string): Promise<void>;
export declare function getPendingRequests(limit?: number): Promise<any[]>;
export interface CreateBlacklistEntryParams {
    address: string;
    reason: string;
    source: 'manual' | 'ofac' | 'system';
    addedBy?: string;
}
export declare function createBlacklistEntry(params: CreateBlacklistEntryParams): Promise<number>;
export declare function getBlacklistEntry(address: string): Promise<any>;
export declare function isBlacklisted(address: string): Promise<boolean>;
export declare function removeBlacklistEntry(address: string): Promise<void>;
export declare function updateBlacklistOnChainStatus(address: string, txSignature: string): Promise<void>;
export declare function getPendingOnChainBlacklist(limit?: number): Promise<any[]>;
export interface CreateWebhookSubscriptionParams {
    name?: string;
    url: string;
    secret: string;
    eventTypes: string[];
    mintAddresses?: string[];
    headers?: Record<string, string>;
}
export declare function createWebhookSubscription(params: CreateWebhookSubscriptionParams): Promise<string>;
export declare function getWebhookSubscriptionById(id: string): Promise<any>;
export declare function getActiveWebhookSubscriptions(): Promise<any[]>;
export declare function deleteWebhookSubscription(id: string): Promise<void>;
export interface CreateWebhookDeliveryParams {
    subscriptionId: string;
    eventId: number;
    requestBody: Record<string, unknown>;
    maxAttempts?: number;
}
export declare function createWebhookDelivery(params: CreateWebhookDeliveryParams): Promise<string>;
export declare function getPendingWebhookDeliveries(limit?: number): Promise<any[]>;
export declare function updateWebhookDeliveryStatus(id: string, status: string, httpStatus?: number, responseBody?: string, errorMessage?: string, nextRetryAt?: Date): Promise<void>;
export interface CreateAuditLogParams {
    action: string;
    entityType: string;
    entityId?: string;
    actor?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}
export declare function createAuditLog(params: CreateAuditLogParams): Promise<void>;
export {};
//# sourceMappingURL=database.d.ts.map