"use strict";
/**
 * SSS Token Indexer Service
 *
 * Listens for on-chain events from the SSS Token program and stores them in PostgreSQL
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
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '1000');
const MAX_SLOT_RANGE = parseInt(process.env.MAX_SLOT_RANGE || '100');
// Create logger context
const log = shared_1.logger.child({ service: 'indexer' });
let isRunning = true;
let connection;
let programId;
/**
 * Initialize connections
 */
async function init() {
    log.info('Initializing indexer service...');
    log.info({ rpcUrl: RPC_URL, programId: PROGRAM_ID }, 'Configuration');
    // Initialize database
    (0, shared_1.initDatabase)();
    log.info('Database initialized');
    // Initialize Redis
    (0, shared_1.initRedis)();
    log.info('Redis initialized');
    // Create Solana connection
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
    // Start from current slot
    const currentSlot = await connection.getSlot();
    return Math.max(0, currentSlot - 100); // Start 100 slots back to catch recent events
}
/**
 * Fetch signatures for a slot range
 * Note: getSignaturesForAddress doesn't support endSlot filtering directly.
 * The 'until' param expects a signature string, not a slot number.
 * We filter by endSlot client-side after fetching.
 */
async function fetchSignatures(startSlot, endSlot) {
    try {
        const signatures = await connection.getSignaturesForAddress(programId, {
            minContextSlot: startSlot,
            limit: 1000,
        });
        // Filter by endSlot client-side since 'until' expects a signature, not a slot
        return signatures.filter(sig => sig.slot <= endSlot);
    }
    catch (error) {
        log.error({ error, startSlot, endSlot }, 'Failed to fetch signatures');
        return [];
    }
}
/**
 * Process a single transaction
 */
async function processTransaction(signature) {
    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
        });
        if (!tx) {
            log.warn({ signature }, 'Transaction not found');
            return;
        }
        // Check if transaction involves our program
        const message = tx.transaction.message;
        const accountKeys = 'accountKeys' in message
            ? message.accountKeys
            : message.staticAccountKeys || [];
        const programIndex = accountKeys.findIndex((key) => key.pubkey?.toString() === PROGRAM_ID ||
            (typeof key === 'string' ? key === PROGRAM_ID : key.toString() === PROGRAM_ID));
        if (programIndex === -1) {
            return; // Not our program
        }
        // Extract instruction data
        const instructions = tx.meta?.innerInstructions?.flat() || [];
        for (const ix of instructions) {
            if (!('instructions' in tx.transaction.message))
                continue;
            const parsed = ix;
            if (parsed.programId?.toString() !== PROGRAM_ID)
                continue;
            // Parse instruction type from logs
            const logs = tx.meta?.logMessages || [];
            const instructionType = parseInstructionType(logs);
            if (!instructionType)
                continue;
            // Extract mint address (first account in most instructions)
            const accounts = parsed.accounts || [];
            const mintAddress = accounts[0]?.toString() || '';
            // Create event record
            const eventData = {
                signature,
                slot: tx.slot,
                blockTime: new Date(tx.blockTime * 1000),
                instructionType,
                mintAddress,
                data: {
                    accounts: accounts.map((a) => a.toString()),
                    data: parsed.data,
                    logs: logs,
                },
            };
            const eventId = await (0, shared_1.createEvent)(eventData);
            log.info({ eventId, signature, instructionType }, 'Event stored');
            // Publish to Redis for other services
            await (0, shared_1.publish)(shared_1.REDIS_CHANNELS.EVENTS, JSON.stringify({
                id: eventId,
                ...eventData,
            }));
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
 * Main indexing loop
 */
async function startIndexing() {
    let currentSlot = await getStartSlot();
    log.info({ startSlot: currentSlot }, 'Starting indexing');
    while (isRunning) {
        try {
            // Get current slot
            const latestSlot = await connection.getSlot();
            if (currentSlot >= latestSlot) {
                // Wait for new slots
                await sleep(POLL_INTERVAL);
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
            await sleep(5000); // Wait before retrying
        }
    }
}
/**
 * Subscribe to real-time logs (WebSocket)
 */
async function subscribeToLogs() {
    log.info('Subscribing to real-time logs...');
    connection.onLogs(programId, async (logs, context) => {
        if (logs.err) {
            log.warn({ err: logs.err }, 'Log error');
            return;
        }
        // Process the transaction
        if (logs.signature) {
            await processTransaction(logs.signature);
        }
    }, COMMITMENT);
    log.info('Subscribed to program logs');
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
        // Subscribe to real-time logs first
        await subscribeToLogs();
        // Then start polling loop (this runs forever)
        await startIndexing();
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