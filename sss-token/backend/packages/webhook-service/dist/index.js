"use strict";
/**
 * SSS Token Webhook Service
 *
 * REST API for webhook subscriptions and event delivery
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const node_cron_1 = __importDefault(require("node-cron"));
const crypto_js_1 = __importDefault(require("crypto-js"));
const shared_1 = require("@sss-backend/shared");
// Configuration
const PORT = parseInt(process.env.PORT || '3003');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const RETRY_INTERVAL = process.env.RETRY_INTERVAL || '*/5 * * * *'; // Every 5 minutes
const log = shared_1.logger.child({ service: 'webhook-service' });
// Express app
const app = (0, express_1.default)();
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Request logging
app.use((req, res, next) => {
    log.info({ method: req.method, path: req.path }, 'Request');
    next();
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'webhook-service', timestamp: new Date().toISOString() });
});
// ============================================
// Subscription Endpoints
// ============================================
// List subscriptions
app.get('/api/v1/subscriptions', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const result = await (0, shared_1.query)('SELECT * FROM webhook_subscriptions ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
        const countResult = await (0, shared_1.query)('SELECT COUNT(*) as count FROM webhook_subscriptions');
        const total = parseInt(countResult.rows[0].count);
        res.json({
            success: true,
            data: result.rows,
            pagination: { page: Math.floor(offset / limit) + 1, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to list subscriptions');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Create subscription
app.post('/api/v1/subscriptions', async (req, res) => {
    try {
        const parseResult = shared_1.CreateWebhookSubscriptionSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.VALIDATION_ERROR,
                    message: 'Invalid request body',
                    details: parseResult.error.issues,
                },
            });
        }
        const { url, eventTypes, mintAddresses, name } = parseResult.data;
        const subscriptionId = await (0, shared_1.createWebhookSubscription)({
            url,
            eventTypes,
            mintAddresses,
            name,
            secret: WEBHOOK_SECRET,
        });
        await (0, shared_1.createAuditLog)({
            action: 'webhook_subscription_created',
            entityType: 'webhook_subscription',
            entityId: subscriptionId.toString(),
            details: { url, eventTypes },
        });
        log.info({ subscriptionId, url }, 'Webhook subscription created');
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: { id: subscriptionId, url, eventTypes, mintAddresses, active: true },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to create subscription');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Get subscription
app.get('/api/v1/subscriptions/:id', async (req, res) => {
    try {
        const subscription = await (0, shared_1.getWebhookSubscriptionById)(req.params.id);
        if (!subscription) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Subscription not found' },
            });
        }
        res.json({ success: true, data: subscription });
    }
    catch (error) {
        log.error({ error }, 'Failed to get subscription');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Delete subscription
app.delete('/api/v1/subscriptions/:id', async (req, res) => {
    try {
        await (0, shared_1.deleteWebhookSubscription)(req.params.id);
        await (0, shared_1.createAuditLog)({
            action: 'webhook_subscription_deleted',
            entityType: 'webhook_subscription',
            entityId: req.params.id,
        });
        log.info({ subscriptionId: req.params.id }, 'Webhook subscription deleted');
        res.json({ success: true, data: { id: req.params.id, deleted: true } });
    }
    catch (error) {
        log.error({ error }, 'Failed to delete subscription');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Delivery Endpoints
// ============================================
// List deliveries
app.get('/api/v1/deliveries', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const subscriptionId = req.query.subscriptionId;
        let sql = 'SELECT * FROM webhook_deliveries';
        const params = [];
        if (subscriptionId) {
            sql += ' WHERE subscription_id = $1';
            params.push(subscriptionId);
        }
        sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);
        const result = await (0, shared_1.query)(sql, params);
        res.json({
            success: true,
            data: result.rows,
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to list deliveries');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Webhook Delivery Logic
// ============================================
function generateSignature(payload, secret) {
    return crypto_js_1.default.HmacSHA256(payload, secret).toString();
}
async function deliverWebhook(deliveryId, url, payload) {
    const payloadStr = JSON.stringify(payload);
    const signature = generateSignature(payloadStr, WEBHOOK_SECRET);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Timestamp': Date.now().toString(),
            },
            body: payloadStr,
        });
        if (response.ok) {
            await (0, shared_1.updateWebhookDeliveryStatus)(deliveryId, 'delivered', response.status);
            log.info({ deliveryId, url, status: response.status }, 'Webhook delivered');
            return true;
        }
        else {
            await (0, shared_1.updateWebhookDeliveryStatus)(deliveryId, 'failed', response.status);
            log.warn({ deliveryId, url, status: response.status }, 'Webhook failed');
            return false;
        }
    }
    catch (error) {
        await (0, shared_1.updateWebhookDeliveryStatus)(deliveryId, 'failed', 0, error instanceof Error ? error.message : 'Unknown error');
        log.error({ error, deliveryId, url }, 'Webhook delivery error');
        return false;
    }
}
async function processEvent(eventData) {
    try {
        const subscriptions = await (0, shared_1.getActiveWebhookSubscriptions)();
        for (const sub of subscriptions) {
            // Check if event type matches
            const eventTypes = sub.event_types || [];
            if (!eventTypes.includes(eventData.instructionType) && !eventTypes.includes('*')) {
                continue;
            }
            // Check if mint matches (if filter is set)
            const mintAddresses = sub.mint_addresses || [];
            if (mintAddresses.length > 0 && !mintAddresses.includes(eventData.mintAddress)) {
                continue;
            }
            // Create delivery record
            const deliveryId = await (0, shared_1.createWebhookDelivery)({
                subscriptionId: sub.id,
                eventId: eventData.id,
                requestBody: eventData,
            });
            // Attempt delivery
            await deliverWebhook(deliveryId, sub.url, eventData);
        }
    }
    catch (error) {
        log.error({ error }, 'Failed to process event');
    }
}
async function retryFailedDeliveries() {
    try {
        const pending = await (0, shared_1.getPendingWebhookDeliveries)(MAX_RETRIES);
        log.info({ count: pending.length }, 'Retrying failed deliveries');
        for (const delivery of pending) {
            await deliverWebhook(delivery.id, delivery.url, delivery.request_body);
        }
    }
    catch (error) {
        log.error({ error }, 'Failed to retry deliveries');
    }
}
// ============================================
// Background Jobs
// ============================================
function startBackgroundJobs() {
    // Retry failed deliveries
    node_cron_1.default.schedule(RETRY_INTERVAL, retryFailedDeliveries);
    log.info({ schedule: RETRY_INTERVAL }, 'Background jobs started');
}
// ============================================
// Redis Event Listener
// ============================================
async function startEventListener() {
    await (0, shared_1.subscribe)(shared_1.REDIS_CHANNELS.EVENTS, (message) => {
        try {
            const eventData = JSON.parse(message);
            processEvent(eventData);
        }
        catch (error) {
            log.error({ error }, 'Failed to handle event');
        }
    });
    log.info('Event listener started');
}
// ============================================
// Initialization
// ============================================
async function init() {
    log.info('Initializing webhook service...');
    (0, shared_1.initDatabase)();
    log.info('Database initialized');
    (0, shared_1.initRedis)();
    log.info('Redis initialized');
    startBackgroundJobs();
    await startEventListener();
    log.info('Webhook service initialized');
}
async function shutdown() {
    log.info('Shutting down webhook service...');
    await (0, shared_1.closeDatabase)();
    await (0, shared_1.closeRedis)();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function main() {
    await init();
    app.listen(PORT, () => {
        log.info({ port: PORT }, 'Webhook service listening');
    });
}
main();
//# sourceMappingURL=index.js.map