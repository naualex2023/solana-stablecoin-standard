/**
 * PostgreSQL database client for SSS Token Backend Services
 */

import pg from 'pg';
const { Pool } = pg;
import type { Pool as PoolType, PoolClient, QueryResult } from 'pg';

// Database configuration
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

// Default pool configuration
const DEFAULT_POOL_CONFIG: Partial<DatabaseConfig> = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

let pool: PoolType | null = null;

/**
 * Initialize the database connection pool
 */
export function initDatabase(config?: DatabaseConfig): PoolType {
  if (pool) {
    return pool;
  }

  const dbConfig: DatabaseConfig = {
    connectionString: process.env.DATABASE_URL,
    ...DEFAULT_POOL_CONFIG,
    ...config,
  };

  pool = new Pool(dbConfig);

  pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
  });

  pool.on('connect', () => {
    console.log('New database connection established');
  });

  return pool;
}

/**
 * Get the database pool (initializes if needed)
 */
export function getPool(): PoolType {
  if (!pool) {
    return initDatabase();
  }
  return pool;
}

/**
 * Execute a query
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = getPool();
  return client.query<T>(text, params);
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const client = await getPool().connect();
  return client;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ============================================
// Events Repository
// ============================================

export interface CreateEventParams {
  signature: string;
  slot: number;
  blockTime: Date;
  instructionType: string;
  mintAddress: string;
  data: Record<string, unknown>;
}

export async function createEvent(params: CreateEventParams): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO events (signature, slot, block_time, instruction_type, mint_address, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (signature) DO UPDATE SET signature = EXCLUDED.signature
     RETURNING id`,
    [params.signature, params.slot, params.blockTime, params.instructionType, params.mintAddress, JSON.stringify(params.data)]
  );
  return result.rows[0].id;
}

export async function getEventBySignature(signature: string) {
  const result = await query(
    'SELECT * FROM events WHERE signature = $1',
    [signature]
  );
  return result.rows[0] || null;
}

export async function getEventsByMint(mintAddress: string, limit = 100, offset = 0) {
  const result = await query(
    'SELECT * FROM events WHERE mint_address = $1 ORDER BY block_time DESC LIMIT $2 OFFSET $3',
    [mintAddress, limit, offset]
  );
  return result.rows;
}

export async function getLatestEventSlot(): Promise<number | null> {
  const result = await query<{ max: string | null }>(
    'SELECT MAX(slot) as max FROM events'
  );
  return result.rows[0]?.max ? parseInt(result.rows[0].max) : null;
}

// ============================================
// Mint/Burn Requests Repository
// ============================================

export interface CreateMintBurnRequestParams {
  type: 'mint' | 'burn';
  mintAddress: string;
  amount: string;
  recipient?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function createMintBurnRequest(params: CreateMintBurnRequestParams) {
  const result = await query<{ id: string }>(
    `INSERT INTO mint_burn_requests (type, mint_address, amount, recipient, idempotency_key, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [params.type, params.mintAddress, params.amount, params.recipient || null, params.idempotencyKey || null, JSON.stringify(params.metadata || {})]
  );
  return result.rows[0].id;
}

export async function getMintBurnRequestById(id: string) {
  const result = await query(
    'SELECT * FROM mint_burn_requests WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getMintBurnRequestByIdempotencyKey(key: string) {
  const result = await query(
    'SELECT * FROM mint_burn_requests WHERE idempotency_key = $1',
    [key]
  );
  return result.rows[0] || null;
}

export async function updateMintBurnRequestStatus(
  id: string,
  status: string,
  txSignature?: string,
  errorMessage?: string
) {
  await query(
    `UPDATE mint_burn_requests 
     SET status = $1, tx_signature = $2, error_message = $3, updated_at = NOW()
     WHERE id = $4`,
    [status, txSignature || null, errorMessage || null, id]
  );
}

export async function getPendingRequests(limit = 10) {
  const result = await query(
    `SELECT * FROM mint_burn_requests 
     WHERE status = 'pending' 
     ORDER BY created_at ASC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============================================
// Blacklist Repository
// ============================================

export interface CreateBlacklistEntryParams {
  address: string;
  reason: string;
  source: 'manual' | 'ofac' | 'system';
  addedBy?: string;
}

export async function createBlacklistEntry(params: CreateBlacklistEntryParams) {
  const result = await query<{ id: number }>(
    `INSERT INTO blacklist (address, reason, source, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source, updated_at = NOW()
     RETURNING id`,
    [params.address, params.reason, params.source, params.addedBy || null]
  );
  return result.rows[0].id;
}

export async function getBlacklistEntry(address: string) {
  const result = await query(
    'SELECT * FROM blacklist WHERE address = $1',
    [address]
  );
  return result.rows[0] || null;
}

export async function isBlacklisted(address: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM blacklist WHERE address = $1)',
    [address]
  );
  return result.rows[0].exists;
}

export async function removeBlacklistEntry(address: string) {
  await query('DELETE FROM blacklist WHERE address = $1', [address]);
}

export async function updateBlacklistOnChainStatus(address: string, txSignature: string) {
  await query(
    'UPDATE blacklist SET on_chain = TRUE, tx_signature = $1, updated_at = NOW() WHERE address = $2',
    [txSignature, address]
  );
}

export async function getPendingOnChainBlacklist(limit = 50) {
  const result = await query(
    `SELECT * FROM blacklist WHERE on_chain = FALSE ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============================================
// Webhook Subscriptions Repository
// ============================================

export interface CreateWebhookSubscriptionParams {
  name?: string;
  url: string;
  secret: string;
  eventTypes: string[];
  mintAddresses?: string[];
  headers?: Record<string, string>;
}

export async function createWebhookSubscription(params: CreateWebhookSubscriptionParams) {
  const result = await query<{ id: string }>(
    `INSERT INTO webhook_subscriptions (name, url, secret, event_types, mint_addresses, headers)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [params.name || null, params.url, params.secret, params.eventTypes, params.mintAddresses || null, JSON.stringify(params.headers || {})]
  );
  return result.rows[0].id;
}

export async function getWebhookSubscriptionById(id: string) {
  const result = await query(
    'SELECT * FROM webhook_subscriptions WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getActiveWebhookSubscriptions() {
  const result = await query(
    'SELECT * FROM webhook_subscriptions WHERE active = TRUE'
  );
  return result.rows;
}

export async function deleteWebhookSubscription(id: string) {
  await query('DELETE FROM webhook_subscriptions WHERE id = $1', [id]);
}

// ============================================
// Webhook Deliveries Repository
// ============================================

export interface CreateWebhookDeliveryParams {
  subscriptionId: string;
  eventId: number;
  requestBody: Record<string, unknown>;
  maxAttempts?: number;
}

export async function createWebhookDelivery(params: CreateWebhookDeliveryParams) {
  const result = await query<{ id: string }>(
    `INSERT INTO webhook_deliveries (subscription_id, event_id, request_body, status, max_attempts)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id`,
    [params.subscriptionId, params.eventId, JSON.stringify(params.requestBody), params.maxAttempts || 5]
  );
  return result.rows[0].id;
}

export async function getPendingWebhookDeliveries(limit = 100) {
  const result = await query(
    `SELECT wd.*, ws.url, ws.secret, ws.headers as subscription_headers
     FROM webhook_deliveries wd
     JOIN webhook_subscriptions ws ON wd.subscription_id = ws.id
     WHERE wd.status IN ('pending', 'retrying')
     AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
     ORDER BY wd.created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function updateWebhookDeliveryStatus(
  id: string,
  status: string,
  httpStatus?: number,
  responseBody?: string,
  errorMessage?: string,
  nextRetryAt?: Date
) {
  const sentAt = status === 'sent' ? new Date() : null;
  await query(
    `UPDATE webhook_deliveries 
     SET status = $1, http_status = $2, response_body = $3, error_message = $4, 
         next_retry_at = $5, sent_at = COALESCE(sent_at, $6), attempts = attempts + 1
     WHERE id = $7`,
    [status, httpStatus || null, responseBody || null, errorMessage || null, nextRetryAt || null, sentAt, id]
  );
}

// ============================================
// Audit Log Repository
// ============================================

export interface CreateAuditLogParams {
  action: string;
  entityType: string;
  entityId?: string;
  actor?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(params: CreateAuditLogParams) {
  await query(
    `INSERT INTO audit_log (action, entity_type, entity_id, actor, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [params.action, params.entityType, params.entityId || null, params.actor || null, 
     JSON.stringify(params.details || {}), params.ipAddress || null, params.userAgent || null]
  );
}
</task_progress>
</write_to_file>