"use strict";
/**
 * SSS Token Compliance Service
 *
 * REST API for blacklist management and OFAC sanctions screening
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
const shared_1 = require("@sss-backend/shared");
// Configuration
const PORT = parseInt(process.env.PORT || '3002');
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || shared_1.SSS_TOKEN_PROGRAM_ID;
const OFAC_SYNC_INTERVAL = process.env.OFAC_SYNC_INTERVAL || '0 0 * * *'; // Daily at midnight
const log = shared_1.logger.child({ service: 'compliance-service' });
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
    res.json({ status: 'ok', service: 'compliance-service', timestamp: new Date().toISOString() });
});
// ============================================
// Blacklist Endpoints
// ============================================
// List blacklist entries
app.get('/api/v1/blacklist', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const source = req.query.source;
        let sql = 'SELECT * FROM blacklist';
        const params = [];
        if (source) {
            sql += ' WHERE source = $1';
            params.push(source);
        }
        sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);
        const result = await (0, shared_1.query)(sql, params);
        // Get total count
        const countResult = await (0, shared_1.query)('SELECT COUNT(*) as count FROM blacklist' + (source ? ' WHERE source = $1' : ''), source ? [source] : []);
        const total = parseInt(countResult.rows[0].count);
        res.json({
            success: true,
            data: result.rows,
            pagination: { page: Math.floor(offset / limit) + 1, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to list blacklist');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Get single blacklist entry
app.get('/api/v1/blacklist/:address', async (req, res) => {
    try {
        const entry = await (0, shared_1.getBlacklistEntry)(req.params.address);
        if (!entry) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Address not in blacklist' },
            });
        }
        res.json({ success: true, data: entry });
    }
    catch (error) {
        log.error({ error }, 'Failed to get blacklist entry');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Add to blacklist
app.post('/api/v1/blacklist', async (req, res) => {
    try {
        const parseResult = shared_1.AddToBlacklistSchema.safeParse(req.body);
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
        const { address, reason, syncOnChain } = parseResult.data;
        const entryId = await (0, shared_1.createBlacklistEntry)({
            address,
            reason,
            source: 'manual',
        });
        await (0, shared_1.createAuditLog)({
            action: 'blacklist_add',
            entityType: 'blacklist_entry',
            entityId: entryId.toString(),
            details: { address, reason },
        });
        log.info({ address, reason, entryId }, 'Address added to blacklist');
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: { id: entryId, address, reason, onChain: false },
        });
        // TODO: Sync on-chain if requested
        if (syncOnChain) {
            log.info({ address }, 'On-chain sync requested (not implemented)');
        }
    }
    catch (error) {
        log.error({ error }, 'Failed to add to blacklist');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Remove from blacklist
app.delete('/api/v1/blacklist/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const entry = await (0, shared_1.getBlacklistEntry)(address);
        if (!entry) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.NOT_FOUND, message: 'Address not in blacklist' },
            });
        }
        await (0, shared_1.removeBlacklistEntry)(address);
        await (0, shared_1.createAuditLog)({
            action: 'blacklist_remove',
            entityType: 'blacklist_entry',
            entityId: address,
            details: { address },
        });
        log.info({ address }, 'Address removed from blacklist');
        res.json({ success: true, data: { address, removed: true } });
    }
    catch (error) {
        log.error({ error }, 'Failed to remove from blacklist');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Seize Endpoint (SSS-2)
// ============================================
// Seize tokens from a frozen account
app.post('/api/v1/seize', async (req, res) => {
    try {
        const { mintAddress, sourceToken, destToken, amount } = req.body;
        if (!mintAddress || !sourceToken || !destToken || !amount) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.VALIDATION_ERROR,
                    message: 'Missing required fields: mintAddress, sourceToken, destToken, amount',
                },
            });
        }
        // Verify source token account is frozen (TODO: Check on-chain state)
        // Create audit log for seize request
        await (0, shared_1.createAuditLog)({
            action: 'seize_request_created',
            entityType: 'seize_request',
            entityId: `${sourceToken}-${Date.now()}`,
            details: { mintAddress, sourceToken, destToken, amount },
        });
        log.info({ mintAddress, sourceToken, destToken, amount }, 'Seize request created');
        // TODO: Execute actual seize transaction using the SDK
        // The seize operation uses the permanent delegate PDA to transfer from frozen accounts
        // PDA seeds: ["permanent_delegate", mint.key()]
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: {
                status: 'pending',
                mintAddress,
                sourceToken,
                destToken,
                amount,
            },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to create seize request');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Screening Endpoints
// ============================================
// Check if address is sanctioned
app.get('/api/v1/screening/check/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const blacklisted = await (0, shared_1.isBlacklisted)(address);
        // TODO: Also check OFAC database
        res.json({
            success: true,
            data: {
                address,
                isBlacklisted: blacklisted,
                isSanctioned: false, // TODO: Implement OFAC check
                lastChecked: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to check screening');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// OFAC Sanctions Endpoints
// ============================================
// Get sync status
app.get('/api/v1/sanctions/status', async (req, res) => {
    try {
        const result = await (0, shared_1.query)('SELECT * FROM sanctions_sync_status WHERE source = $1', ['ofac']);
        res.json({ success: true, data: result.rows[0] || null });
    }
    catch (error) {
        log.error({ error }, 'Failed to get sanctions status');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Trigger OFAC sync
app.post('/api/v1/sanctions/sync', async (req, res) => {
    try {
        log.info('OFAC sync triggered');
        // TODO: Implement actual OFAC sync
        res.json({
            success: true,
            data: { message: 'Sync started', timestamp: new Date().toISOString() },
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to sync sanctions');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Background Jobs
// ============================================
function startBackgroundJobs() {
    // Schedule OFAC sync
    node_cron_1.default.schedule(OFAC_SYNC_INTERVAL, async () => {
        log.info('Running scheduled OFAC sync');
        // TODO: Implement OFAC sync
    });
    log.info({ schedule: OFAC_SYNC_INTERVAL }, 'Background jobs started');
}
// ============================================
// Initialization
// ============================================
async function init() {
    log.info('Initializing compliance service...');
    (0, shared_1.initDatabase)();
    log.info('Database initialized');
    (0, shared_1.initRedis)();
    log.info('Redis initialized');
    startBackgroundJobs();
    log.info('Compliance service initialized');
}
async function shutdown() {
    log.info('Shutting down compliance service...');
    await (0, shared_1.closeDatabase)();
    await (0, shared_1.closeRedis)();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function main() {
    await init();
    app.listen(PORT, () => {
        log.info({ port: PORT }, 'Compliance service listening');
    });
}
main();
//# sourceMappingURL=index.js.map