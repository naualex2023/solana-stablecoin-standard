"use strict";
/**
 * SSS Token Indexer Service
 *
 * Listens for on-chain events from the SSS Token program and stores them in PostgreSQL
 *
 * Modes:
 * - WebSocket-only (INDEXER_MODE=websocket): Only subscribes to real-time logs (good for rate-limited RPCs)
 * - Polling-only (INDEXER_MODE=polling): Only polls for historical transactions
 * - Hybrid (INDEXER_MODE=hybrid, default): Both WebSocket and polling
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const web3_js_1 = require("@solana/web3.js");
const shared_1 = require("@sss-backend/shared");
// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const WS_URL = process.env.SOLANA_WS_URL || 'ws://localhost:8900';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || shared_1.SSS_TOKEN_PROGRAM_ID;
const COMMITMENT = process.env.COMMITMENT || 'confirmed';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000'); // Increased default to 5s
const MAX_SLOT_RANGE = parseInt(process.env.MAX_SLOT_RANGE || '50'); // Reduced to avoid rate limits
const INDEXER_MODE = process.env.INDEXER_MODE || 'hybrid'; // 'websocket', 'polling', or 'hybrid'
const RATE_LIMIT_RETRIES = parseInt(process.env.RATE_LIMIT_RETRIES || '5');
const RATE_LIMIT_BASE_DELAY = parseInt(process.env.RATE_LIMIT_BASE_DELAY || '2000');
// Create logger context
const log = shared_1.logger.child({ service: 'indexer' });
let isRunning = true;
let connection;
let programId;
let rateLimitCount = 0;
let lastRateLimitTime = 0;
/**
 * Initialize connections
 */
async function init() {
    log.info('Initializing indexer service...');
    log.info({
        rpcUrl: RPC_URL,
        programId: PROGRAM_ID,
        mode: INDEXER_MODE,
        pollInterval: POLL_INTERVAL,
    }, 'Configuration');
    // Initialize database
    (0, shared_1.initDatabase)();
    log.info('Database initialized');
    // Initialize Redis
    (0, shared_1.initRedis)();
    log.info('Redis initialized');
    // Create Solana connection with custom commitment
    connection = new web3_js_1.Connection(RPC_URL, {
        commitment: COMMITMENT,
        wsEndpoint: WS_URL,
    });
    programId = new web3_js_1.PublicKey(PROGRAM_ID);
    log.info('Solana connection established');
    // Verify connection
    const version = await connection.getVersion();
    log.info({ version }, 'Connected to Solana node');
}
/**
 * Get the starting slot for indexing
 */
async function getStartSlot() {
    // Check for manual override
    const envStartSlot = process.env.START_SLOT;
    if (envStartSlot) {
        return parseInt(envStartSlot);
    }
    // Get latest processed slot from database
    const latestSlot = await (0, shared_1.getLatestEventSlot)();
    if (latestSlot !== null) {
        return latestSlot + 1;
    }
    // Start from current slot (don't go back for public RPC to avoid rate limits)
    const currentSlot = await connection.getSlot();
    // For public RPC, start fresh to avoid rate limiting
    if (RPC_URL.includes('api.devnet.solana.com') || RPC_URL.includes('api.mainnet-beta.solana.com')) {
        log.warn('Using public RPC - starting from current slot to avoid rate limiting');
        return currentSlot;
    }
    return Math.max(0, currentSlot - 100);
}
/**
 * Sleep with exponential backoff for rate limiting
 */
async function sleepWithBackoff(baseMs, attempt) {
    const delay = baseMs * Math.pow(2, Math.min(attempt, 6)); // Cap at 64x base
    log.warn({ delay, attempt }, 'Rate limited - backing off');
    await new Promise(resolve => setTimeout(resolve, delay));
}
/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error) {
    if (!error)
        return false;
    const msg = error.message || error.toString();
    return msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit');
}
/**
 * Execute a function with rate limit retry logic
 */
async function withRateLimitRetry(fn, operation) {
    let lastError = null;
    for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
        try {
            const result = await fn();
            // Reset rate limit count on success
            rateLimitCount = 0;
            return result;
        }
        catch (error) {
            lastError = error;
            if (isRateLimitError(error)) {
                rateLimitCount++;
                lastRateLimitTime = Date.now();
                if (attempt < RATE_LIMIT_RETRIES - 1) {
                    await sleepWithBackoff(RATE_LIMIT_BASE_DELAY, attempt);
                }
            }
            else {
                // Non-rate-limit error, don't retry
                throw error;
            }
        }
    }
    log.error({ error: lastError, operation }, 'Rate limit retries exhausted');
    return null;
}
/**
 * Fetch signatures for a slot range with rate limit handling
 */
async function fetchSignatures(startSlot, endSlot) {
    const result = await withRateLimitRetry(async () => {
        const signatures = await connection.getSignaturesForAddress(programId, {
            minContextSlot: startSlot,
            limit: 100,
        });
        // Filter by endSlot client-side
        return signatures.filter(sig => sig.slot <= endSlot);
    }, 'fetchSignatures');
    return result || [];
}
/**
 * Process a single transaction
 */
async function processTransaction(signature) {
    try {
        const tx = await withRateLimitRetry(async () => {
            return await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
            });
        }, 'getParsedTransaction');
        if (!tx) {
            log.warn({ signature }, 'Transaction not found');
            return;
        }
        // Parse instruction type from logs first
        const logs = tx.meta?.logMessages || [];
        const instructionType = parseInstructionType(logs);
        if (!instructionType) {
            log.debug({ signature }, 'No SSS instruction found in logs');
            return;
        }
        // Get account keys from the message
        const message = tx.transaction.message;
        const accountKeys = 'accountKeys' in message
            ? message.accountKeys
            : [];
        // Find our program in account keys
        const programIndex = accountKeys.findIndex((key) => key.pubkey?.toString() === PROGRAM_ID ||
            (typeof key === 'string' ? key === PROGRAM_ID : key.toString() === PROGRAM_ID));
        if (programIndex === -1) {
            log.debug({ signature }, 'Program not in account keys');
            return;
        }
        // Get main instructions (not inner instructions!)
        const instructions = 'instructions' in message
            ? message.instructions
            : [];
        // Find instructions that call our program
        for (const ix of instructions) {
            // Check if this instruction is for our program
            const ixProgramId = ix.programId || (typeof ix.programIdIndex === 'number' ? accountKeys[ix.programIdIndex] : null);
            if (!ixProgramId)
                continue;
            const ixProgramStr = typeof ixProgramId === 'string' ? ixProgramId : ixProgramId.toString?.() || ixProgramId.pubkey?.toString?.();
            if (ixProgramStr !== PROGRAM_ID) {
                continue;
            }
            // Extract accounts from instruction
            const accounts = (ix.accounts || []).map((idx) => {
                const acc = accountKeys[idx];
                return typeof acc === 'string' ? acc : acc?.pubkey?.toString?.() || acc?.toString?.() || '';
            });
            // Mint address is typically the first account
            const mintAddress = accounts[0] || '';
            // Parse instruction data if available
            let instructionData = {};
            if (ix.data) {
                try {
                    // Try to decode base64 data
                    const dataBuffer = Buffer.from(ix.data, 'base64');
                    instructionData = {
                        raw: ix.data,
                        // First 8 bytes is Anchor discriminator
                        discriminator: dataBuffer.slice(0, 8).toString('hex'),
                    };
                }
                catch (e) {
                    instructionData = { raw: ix.data };
                }
            }
            // Create event record
            const eventData = {
                signature,
                slot: tx.slot,
                blockTime: new Date(tx.blockTime * 1000),
                instructionType,
                mintAddress,
                data: {
                    accounts,
                    instruction: instructionData,
                    logs: logs.slice(0, 20), // Limit log size
                    fee: tx.meta?.fee,
                    success: !tx.meta?.err,
                },
            };
            const eventId = await (0, shared_1.createEvent)(eventData);
            log.info({ eventId, signature, instructionType, mintAddress }, 'Event stored');
            // Publish to Redis for other services
            await (0, shared_1.publish)(shared_1.REDIS_CHANNELS.EVENTS, JSON.stringify({
                id: eventId,
                ...eventData,
            }));
            // Only process first matching instruction per transaction
            break;
        }
    }
    catch (error) {
        log.error({ error, signature }, 'Failed to process transaction');
    }
}
/**
 * Parse instruction type from transaction logs
 */
function parseInstructionType(logs) {
    for (const log of logs) {
        if (log.includes('Program log: Instruction:')) {
            const match = log.match(/Instruction:\s*(\w+)/);
            if (match) {
                return match[1];
            }
        }
    }
    return null;
}
/**
 * Main indexing loop (for polling mode)
 */
async function startIndexing() {
    // Skip polling in websocket-only mode
    if (INDEXER_MODE === 'websocket') {
        log.info('WebSocket-only mode - skipping polling loop');
        return;
    }
    let currentSlot = await getStartSlot();
    log.info({ startSlot: currentSlot }, 'Starting indexing');
    while (isRunning) {
        try {
            // Check if we're being rate limited too much
            if (rateLimitCount > 10 && Date.now() - lastRateLimitTime < 60000) {
                log.warn('Too many rate limits - pausing polling for 60 seconds');
                await new Promise(resolve => setTimeout(resolve, 60000));
                rateLimitCount = 0;
                continue;
            }
            // Get current slot
            const latestSlot = await withRateLimitRetry(() => connection.getSlot(), 'getSlot');
            if (latestSlot === null) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                continue;
            }
            if (currentSlot >= latestSlot) {
                // Wait for new slots
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                continue;
            }
            // Process slot range
            const endSlot = Math.min(currentSlot + MAX_SLOT_RANGE, latestSlot);
            log.debug({ startSlot: currentSlot, endSlot }, 'Processing slot range');
            const signatures = await fetchSignatures(currentSlot, endSlot);
            for (const sigInfo of signatures) {
                await processTransaction(sigInfo.signature);
            }
            currentSlot = endSlot + 1;
        }
        catch (error) {
            log.error({ error }, 'Error in indexing loop');
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 2));
        }
    }
}
/**
 * Subscribe to real-time logs (WebSocket)
 */
async function subscribeToLogs() {
    // Skip WebSocket in polling-only mode
    if (INDEXER_MODE === 'polling') {
        log.info('Polling-only mode - skipping WebSocket subscription');
        return;
    }
    log.info('Subscribing to real-time logs...');
    try {
        const subscriptionId = connection.onLogs(programId, async (logs, context) => {
            if (logs.err) {
                log.warn({ err: logs.err }, 'Log error');
                return;
            }
            // Process the transaction
            if (logs.signature) {
                log.debug({ signature: logs.signature }, 'Received real-time log');
                await processTransaction(logs.signature);
            }
        }, COMMITMENT);
        log.info({ subscriptionId }, 'Subscribed to program logs via WebSocket');
    }
    catch (error) {
        log.error({ error }, 'Failed to subscribe to logs - will rely on polling');
    }
}
/**
 * Graceful shutdown
 */
async function shutdown() {
    log.info('Shutting down indexer...');
    isRunning = false;
    try {
        await (0, shared_1.closeDatabase)();
        await (0, shared_1.closeRedis)();
        log.info('Shutdown complete');
    }
    catch (error) {
        log.error({ error }, 'Error during shutdown');
    }
    process.exit(0);
}
/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Main entry point
async function main() {
    try {
        await init();
        // Subscribe to real-time logs first (works even with rate-limited HTTP)
        await subscribeToLogs();
        // Then start polling loop (if enabled)
        await startIndexing();
        // Keep process alive in websocket-only mode
        if (INDEXER_MODE === 'websocket') {
            log.info('Running in WebSocket-only mode - waiting for events...');
            while (isRunning) {
                await sleep(60000); // Just keep alive
            }
        }
    }
    catch (error) {
        log.error({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Fatal error');
        process.exit(1);
    }
}
// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Start the service
main();
//# sourceMappingURL=index.js.map