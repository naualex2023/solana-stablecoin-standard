"use strict";
/**
 * SSS Token Mint/Burn Service
 *
 * REST API for creating and managing mint/burn requests
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const web3_js_1 = require("@solana/web3.js");
const shared_1 = require("@sss-backend/shared");
const uuid_1 = require("uuid");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || shared_1.SSS_TOKEN_PROGRAM_ID;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || './secrets/minter.json';
const log = shared_1.logger.child({ service: 'mint-burn-service' });
let connection;
let program = null;
let minterKeypair = null;
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
    res.json({ status: 'ok', service: 'mint-burn-service', timestamp: new Date().toISOString() });
});
// ============================================
// Mint Request Endpoints
// ============================================
// Create mint request
app.post('/api/v1/mint-requests', async (req, res) => {
    try {
        const parseResult = shared_1.CreateMintRequestSchema.safeParse(req.body);
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
        const { mintAddress, amount, recipient, idempotencyKey, metadata } = parseResult.data;
        // Check if recipient is blacklisted
        const blacklisted = await (0, shared_1.isBlacklisted)(recipient);
        if (blacklisted) {
            return res.status(shared_1.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                error: {
                    code: shared_1.ERROR_CODES.ADDRESS_BLACKLISTED,
                    message: 'Recipient address is blacklisted',
                },
            });
        }
        // Check idempotency
        if (idempotencyKey) {
            const existing = await (0, shared_1.getMintBurnRequestByIdempotencyKey)(idempotencyKey);
            if (existing) {
                return res.status(shared_1.HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: {
                        code: shared_1.ERROR_CODES.DUPLICATE_IDEMPOTENCY_KEY,
                        message: 'Request with this idempotency key already exists',
                    },
                    data: { requestId: existing.id },
                });
            }
        }
        // Create request
        const requestId = await (0, shared_1.createMintBurnRequest)({
            type: 'mint',
            mintAddress,
            amount,
            recipient,
            idempotencyKey,
            metadata,
        });
        // Audit log
        await (0, shared_1.createAuditLog)({
            action: 'mint_request_created',
            entityType: 'mint_request',
            entityId: requestId,
            details: { mintAddress, amount, recipient },
        });
        log.info({ requestId, mintAddress, amount, recipient }, 'Mint request created');
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: { requestId, status: 'pending' },
        });
        // Trigger background processing
        processRequest(requestId).catch(err => {
            log.error({ err, requestId }, 'Failed to process mint request');
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to create mint request');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Get mint request status
app.get('/api/v1/mint-requests/:id', async (req, res) => {
    try {
        const request = await (0, shared_1.getMintBurnRequestById)(req.params.id);
        if (!request) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.REQUEST_NOT_FOUND, message: 'Request not found' },
            });
        }
        res.json({ success: true, data: request });
    }
    catch (error) {
        log.error({ error }, 'Failed to get mint request');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Burn Request Endpoints
// ============================================
// Create burn request
app.post('/api/v1/burn-requests', async (req, res) => {
    try {
        const parseResult = shared_1.CreateBurnRequestSchema.safeParse(req.body);
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
        const { mintAddress, amount, idempotencyKey, metadata } = parseResult.data;
        // Check idempotency
        if (idempotencyKey) {
            const existing = await (0, shared_1.getMintBurnRequestByIdempotencyKey)(idempotencyKey);
            if (existing) {
                return res.status(shared_1.HTTP_STATUS.CONFLICT).json({
                    success: false,
                    error: {
                        code: shared_1.ERROR_CODES.DUPLICATE_IDEMPOTENCY_KEY,
                        message: 'Request with this idempotency key already exists',
                    },
                    data: { requestId: existing.id },
                });
            }
        }
        // Create request
        const requestId = await (0, shared_1.createMintBurnRequest)({
            type: 'burn',
            mintAddress,
            amount,
            idempotencyKey,
            metadata,
        });
        // Audit log
        await (0, shared_1.createAuditLog)({
            action: 'burn_request_created',
            entityType: 'burn_request',
            entityId: requestId,
            details: { mintAddress, amount },
        });
        log.info({ requestId, mintAddress, amount }, 'Burn request created');
        res.status(shared_1.HTTP_STATUS.CREATED).json({
            success: true,
            data: { requestId, status: 'pending' },
        });
        // Trigger background processing
        processRequest(requestId).catch(err => {
            log.error({ err, requestId }, 'Failed to process burn request');
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to create burn request');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// Get burn request status
app.get('/api/v1/burn-requests/:id', async (req, res) => {
    try {
        const request = await (0, shared_1.getMintBurnRequestById)(req.params.id);
        if (!request) {
            return res.status(shared_1.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                error: { code: shared_1.ERROR_CODES.REQUEST_NOT_FOUND, message: 'Request not found' },
            });
        }
        res.json({ success: true, data: request });
    }
    catch (error) {
        log.error({ error }, 'Failed to get burn request');
        res.status(shared_1.HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            error: { code: shared_1.ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
        });
    }
});
// ============================================
// Background Processing
// ============================================
async function processRequest(requestId) {
    try {
        const request = await (0, shared_1.getMintBurnRequestById)(requestId);
        if (!request || request.status !== 'pending') {
            return;
        }
        // Update status to processing
        await (0, shared_1.updateMintBurnRequestStatus)(requestId, 'processing');
        if (!program || !minterKeypair) {
            throw new Error('Program or keypair not initialized');
        }
        // Build and send transaction
        // Note: This is a simplified version - actual implementation would use the SDK
        const txSignature = `simulated_tx_${(0, uuid_1.v4)()}`;
        // Update status to completed
        await (0, shared_1.updateMintBurnRequestStatus)(requestId, 'completed', txSignature);
        log.info({ requestId, txSignature }, 'Request completed');
    }
    catch (error) {
        log.error({ error, requestId }, 'Request processing failed');
        await (0, shared_1.updateMintBurnRequestStatus)(requestId, 'failed', undefined, error instanceof Error ? error.message : 'Unknown error');
    }
}
// ============================================
// Initialization
// ============================================
async function init() {
    log.info('Initializing mint/burn service...');
    // Initialize database
    (0, shared_1.initDatabase)();
    log.info('Database initialized');
    // Initialize Redis
    (0, shared_1.initRedis)();
    log.info('Redis initialized');
    // Create Solana connection
    connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
    log.info({ rpcUrl: RPC_URL }, 'Solana connection established');
    // Load minter keypair
    const keypairFullPath = path.resolve(KEYPAIR_PATH);
    if (fs.existsSync(keypairFullPath)) {
        const keypairData = JSON.parse(fs.readFileSync(keypairFullPath, 'utf-8'));
        minterKeypair = web3_js_1.Keypair.fromSecretKey(Uint8Array.from(keypairData));
        log.info({ publicKey: minterKeypair.publicKey.toString() }, 'Minter keypair loaded');
    }
    else {
        log.warn({ path: keypairFullPath }, 'Minter keypair not found - transactions will be simulated');
    }
    log.info('Mint/Burn service initialized');
}
// Graceful shutdown
async function shutdown() {
    log.info('Shutting down mint/burn service...');
    await (0, shared_1.closeDatabase)();
    await (0, shared_1.closeRedis)();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Start server
async function main() {
    await init();
    app.listen(PORT, () => {
        log.info({ port: PORT }, 'Mint/Burn service listening');
    });
}
main();
//# sourceMappingURL=index.js.map