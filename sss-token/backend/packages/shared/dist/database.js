"use strict";
/**
 * PostgreSQL database client for SSS Token Backend Services
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = initDatabase;
exports.getPool = getPool;
exports.query = query;
exports.getClient = getClient;
exports.transaction = transaction;
exports.closeDatabase = closeDatabase;
exports.createEvent = createEvent;
exports.getEventBySignature = getEventBySignature;
exports.getEventsByMint = getEventsByMint;
exports.getLatestEventSlot = getLatestEventSlot;
exports.createMintBurnRequest = createMintBurnRequest;
exports.getMintBurnRequestById = getMintBurnRequestById;
exports.getMintBurnRequestByIdempotencyKey = getMintBurnRequestByIdempotencyKey;
exports.updateMintBurnRequestStatus = updateMintBurnRequestStatus;
exports.getPendingRequests = getPendingRequests;
exports.createBlacklistEntry = createBlacklistEntry;
exports.getBlacklistEntry = getBlacklistEntry;
exports.isBlacklisted = isBlacklisted;
exports.removeBlacklistEntry = removeBlacklistEntry;
exports.updateBlacklistOnChainStatus = updateBlacklistOnChainStatus;
exports.getPendingOnChainBlacklist = getPendingOnChainBlacklist;
exports.createWebhookSubscription = createWebhookSubscription;
exports.getWebhookSubscriptionById = getWebhookSubscriptionById;
exports.getActiveWebhookSubscriptions = getActiveWebhookSubscriptions;
exports.deleteWebhookSubscription = deleteWebhookSubscription;
exports.createWebhookDelivery = createWebhookDelivery;
exports.getPendingWebhookDeliveries = getPendingWebhookDeliveries;
exports.updateWebhookDeliveryStatus = updateWebhookDeliveryStatus;
exports.createAuditLog = createAuditLog;
const pg_1 = __importDefault(require("pg"));
const { Pool } = pg_1.default;
// Default pool configuration
const DEFAULT_POOL_CONFIG = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};
let pool = null;
/**
 * Initialize the database connection pool
 */
function initDatabase(config) {
    if (pool) {
        return pool;
    }
    const dbConfig = {
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
function getPool() {
    if (!pool) {
        return initDatabase();
    }
    return pool;
}
/**
 * Execute a query
 */
async function query(text, params) {
    const client = getPool();
    return client.query(text, params);
}
/**
 * Get a client from the pool for transactions
 */
async function getClient() {
    const client = await getPool().connect();
    return client;
}
/**
 * Execute a transaction
 */
async function transaction(callback) {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Close the database connection pool
 */
async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
async function createEvent(params) {
    const result = await query(`INSERT INTO events (signature, slot, block_time, instruction_type, mint_address, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (signature) DO UPDATE SET signature = EXCLUDED.signature
     RETURNING id`, [params.signature, params.slot, params.blockTime, params.instructionType, params.mintAddress, JSON.stringify(params.data)]);
    return result.rows[0].id;
}
async function getEventBySignature(signature) {
    const result = await query('SELECT * FROM events WHERE signature = $1', [signature]);
    return result.rows[0] || null;
}
async function getEventsByMint(mintAddress, limit = 100, offset = 0) {
    const result = await query('SELECT * FROM events WHERE mint_address = $1 ORDER BY block_time DESC LIMIT $2 OFFSET $3', [mintAddress, limit, offset]);
    return result.rows;
}
async function getLatestEventSlot() {
    const result = await query('SELECT MAX(slot) as max FROM events');
    return result.rows[0]?.max ? parseInt(result.rows[0].max) : null;
}
async function createMintBurnRequest(params) {
    const result = await query(`INSERT INTO mint_burn_requests (type, mint_address, amount, recipient, idempotency_key, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`, [params.type, params.mintAddress, params.amount, params.recipient || null, params.idempotencyKey || null, JSON.stringify(params.metadata || {})]);
    return result.rows[0].id;
}
async function getMintBurnRequestById(id) {
    const result = await query('SELECT * FROM mint_burn_requests WHERE id = $1', [id]);
    return result.rows[0] || null;
}
async function getMintBurnRequestByIdempotencyKey(key) {
    const result = await query('SELECT * FROM mint_burn_requests WHERE idempotency_key = $1', [key]);
    return result.rows[0] || null;
}
async function updateMintBurnRequestStatus(id, status, txSignature, errorMessage) {
    await query(`UPDATE mint_burn_requests 
     SET status = $1, tx_signature = $2, error_message = $3, updated_at = NOW()
     WHERE id = $4`, [status, txSignature || null, errorMessage || null, id]);
}
async function getPendingRequests(limit = 10) {
    const result = await query(`SELECT * FROM mint_burn_requests 
     WHERE status = 'pending' 
     ORDER BY created_at ASC 
     LIMIT $1`, [limit]);
    return result.rows;
}
async function createBlacklistEntry(params) {
    const result = await query(`INSERT INTO blacklist (address, reason, source, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source, updated_at = NOW()
     RETURNING id`, [params.address, params.reason, params.source, params.addedBy || null]);
    return result.rows[0].id;
}
async function getBlacklistEntry(address) {
    const result = await query('SELECT * FROM blacklist WHERE address = $1', [address]);
    return result.rows[0] || null;
}
async function isBlacklisted(address) {
    const result = await query('SELECT EXISTS(SELECT 1 FROM blacklist WHERE address = $1)', [address]);
    return result.rows[0].exists;
}
async function removeBlacklistEntry(address) {
    await query('DELETE FROM blacklist WHERE address = $1', [address]);
}
async function updateBlacklistOnChainStatus(address, txSignature) {
    await query('UPDATE blacklist SET on_chain = TRUE, tx_signature = $1, updated_at = NOW() WHERE address = $2', [txSignature, address]);
}
async function getPendingOnChainBlacklist(limit = 50) {
    const result = await query(`SELECT * FROM blacklist WHERE on_chain = FALSE ORDER BY created_at ASC LIMIT $1`, [limit]);
    return result.rows;
}
async function createWebhookSubscription(params) {
    const result = await query(`INSERT INTO webhook_subscriptions (name, url, secret, event_types, mint_addresses, headers)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`, [params.name || null, params.url, params.secret, params.eventTypes, params.mintAddresses || null, JSON.stringify(params.headers || {})]);
    return result.rows[0].id;
}
async function getWebhookSubscriptionById(id) {
    const result = await query('SELECT * FROM webhook_subscriptions WHERE id = $1', [id]);
    return result.rows[0] || null;
}
async function getActiveWebhookSubscriptions() {
    const result = await query('SELECT * FROM webhook_subscriptions WHERE active = TRUE');
    return result.rows;
}
async function deleteWebhookSubscription(id) {
    await query('DELETE FROM webhook_subscriptions WHERE id = $1', [id]);
}
async function createWebhookDelivery(params) {
    const result = await query(`INSERT INTO webhook_deliveries (subscription_id, event_id, request_body, status, max_attempts)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id`, [params.subscriptionId, params.eventId, JSON.stringify(params.requestBody), params.maxAttempts || 5]);
    return result.rows[0].id;
}
async function getPendingWebhookDeliveries(limit = 100) {
    const result = await query(`SELECT wd.*, ws.url, ws.secret, ws.headers as subscription_headers
     FROM webhook_deliveries wd
     JOIN webhook_subscriptions ws ON wd.subscription_id = ws.id
     WHERE wd.status IN ('pending', 'retrying')
     AND (wd.next_retry_at IS NULL OR wd.next_retry_at <= NOW())
     ORDER BY wd.created_at ASC
     LIMIT $1`, [limit]);
    return result.rows;
}
async function updateWebhookDeliveryStatus(id, status, httpStatus, responseBody, errorMessage, nextRetryAt) {
    const sentAt = status === 'sent' ? new Date() : null;
    await query(`UPDATE webhook_deliveries 
     SET status = $1, http_status = $2, response_body = $3, error_message = $4, 
         next_retry_at = $5, sent_at = COALESCE(sent_at, $6), attempts = attempts + 1
     WHERE id = $7`, [status, httpStatus || null, responseBody || null, errorMessage || null, nextRetryAt || null, sentAt, id]);
}
async function createAuditLog(params) {
    await query(`INSERT INTO audit_log (action, entity_type, entity_id, actor, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [params.action, params.entityType, params.entityId || null, params.actor || null,
        JSON.stringify(params.details || {}), params.ipAddress || null, params.userAgent || null]);
}
//# sourceMappingURL=database.js.map