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

import 'dotenv/config';
import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import {
  initDatabase,
  closeDatabase,
  createEvent,
  getLatestEventSlot,
  initRedis,
  closeRedis,
  publish,
  logger,
  REDIS_CHANNELS,
  SSS_TOKEN_PROGRAM_ID,
} from '@sss-backend/shared';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const WS_URL = process.env.SOLANA_WS_URL || 'ws://localhost:8900';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || SSS_TOKEN_PROGRAM_ID;
const COMMITMENT: Commitment = (process.env.COMMITMENT as Commitment) || 'confirmed';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000'); // Increased default to 5s
const MAX_SLOT_RANGE = parseInt(process.env.MAX_SLOT_RANGE || '50'); // Reduced to avoid rate limits
const INDEXER_MODE = process.env.INDEXER_MODE || 'hybrid'; // 'websocket', 'polling', or 'hybrid'
const RATE_LIMIT_RETRIES = parseInt(process.env.RATE_LIMIT_RETRIES || '5');
const RATE_LIMIT_BASE_DELAY = parseInt(process.env.RATE_LIMIT_BASE_DELAY || '2000');

// Create logger context
const log = logger.child({ service: 'indexer' });

let isRunning = true;
let connection: Connection;
let programId: PublicKey;
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
  initDatabase();
  log.info('Database initialized');

  // Initialize Redis
  initRedis();
  log.info('Redis initialized');

  // Create Solana connection with custom commitment
  connection = new Connection(RPC_URL, {
    commitment: COMMITMENT,
    wsEndpoint: WS_URL,
  });
  programId = new PublicKey(PROGRAM_ID);
  log.info('Solana connection established');

  // Verify connection
  const version = await connection.getVersion();
  log.info({ version }, 'Connected to Solana node');
}

/**
 * Get the starting slot for indexing
 */
async function getStartSlot(): Promise<number> {
  // Check for manual override
  const envStartSlot = process.env.START_SLOT;
  if (envStartSlot) {
    return parseInt(envStartSlot);
  }

  // Get latest processed slot from database
  const latestSlot = await getLatestEventSlot();
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
async function sleepWithBackoff(baseMs: number, attempt: number): Promise<void> {
  const delay = baseMs * Math.pow(2, Math.min(attempt, 6)); // Cap at 64x base
  log.warn({ delay, attempt }, 'Rate limited - backing off');
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const msg = error.message || error.toString();
  return msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit');
}

/**
 * Execute a function with rate limit retry logic
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  operation: string
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
    try {
      const result = await fn();
      // Reset rate limit count on success
      rateLimitCount = 0;
      return result;
    } catch (error: any) {
      lastError = error;
      
      if (isRateLimitError(error)) {
        rateLimitCount++;
        lastRateLimitTime = Date.now();
        
        if (attempt < RATE_LIMIT_RETRIES - 1) {
          await sleepWithBackoff(RATE_LIMIT_BASE_DELAY, attempt);
        }
      } else {
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
async function fetchSignatures(startSlot: number, endSlot: number) {
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
async function processTransaction(signature: string) {
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

    // Check if transaction involves our program
    const message = tx.transaction.message;
    const accountKeys = 'accountKeys' in message 
      ? (message as any).accountKeys 
      : (message as any).staticAccountKeys || [];
    
    const programIndex = accountKeys.findIndex(
      (key: any) => key.pubkey?.toString() === PROGRAM_ID || 
                    (typeof key === 'string' ? key === PROGRAM_ID : key.toString() === PROGRAM_ID)
    );

    if (programIndex === -1) {
      return; // Not our program
    }

    // Extract instruction data
    const instructions = tx.meta?.innerInstructions?.flat() || [];
    
    for (const ix of instructions) {
      if (!('instructions' in tx.transaction.message)) continue;
      
      const parsed = ix as any;
      if (parsed.programId?.toString() !== PROGRAM_ID) continue;

      // Parse instruction type from logs
      const logs = tx.meta?.logMessages || [];
      const instructionType = parseInstructionType(logs);
      
      if (!instructionType) continue;

      // Extract mint address (first account in most instructions)
      const accounts = parsed.accounts || [];
      const mintAddress = accounts[0]?.toString() || '';

      // Create event record
      const eventData = {
        signature,
        slot: tx.slot,
        blockTime: new Date(tx.blockTime! * 1000),
        instructionType,
        mintAddress,
        data: {
          accounts: accounts.map((a: any) => a.toString()),
          data: parsed.data,
          logs: logs,
        },
      };

      const eventId = await createEvent(eventData);
      log.info({ eventId, signature, instructionType }, 'Event stored');

      // Publish to Redis for other services
      await publish(REDIS_CHANNELS.EVENTS, JSON.stringify({
        id: eventId,
        ...eventData,
      }));
    }

  } catch (error) {
    log.error({ error, signature }, 'Failed to process transaction');
  }
}

/**
 * Parse instruction type from transaction logs
 */
function parseInstructionType(logs: string[]): string | null {
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
      const latestSlot = await withRateLimitRetry(
        () => connection.getSlot(),
        'getSlot'
      );
      
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

    } catch (error) {
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
    const subscriptionId = connection.onLogs(
      programId,
      async (logs, context) => {
        if (logs.err) {
          log.warn({ err: logs.err }, 'Log error');
          return;
        }

        // Process the transaction
        if (logs.signature) {
          log.debug({ signature: logs.signature }, 'Received real-time log');
          await processTransaction(logs.signature);
        }
      },
      COMMITMENT
    );

    log.info({ subscriptionId }, 'Subscribed to program logs via WebSocket');
  } catch (error) {
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
    await closeDatabase();
    await closeRedis();
    log.info('Shutdown complete');
  } catch (error) {
    log.error({ error }, 'Error during shutdown');
  }

  process.exit(0);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
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

  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, 'Fatal error');
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the service
main();