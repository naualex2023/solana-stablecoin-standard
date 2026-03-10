/**
 * SSS Token Indexer Service
 * 
 * Listens for on-chain events from the SSS Token program and stores them in PostgreSQL
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
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '1000');
const MAX_SLOT_RANGE = parseInt(process.env.MAX_SLOT_RANGE || '100');

// Create logger context
const log = logger.child({ service: 'indexer' });

let isRunning = true;
let connection: Connection;
let programId: PublicKey;

/**
 * Initialize connections
 */
async function init() {
  log.info('Initializing indexer service...');
  log.info({ rpcUrl: RPC_URL, programId: PROGRAM_ID }, 'Configuration');

  // Initialize database
  initDatabase();
  log.info('Database initialized');

  // Initialize Redis
  initRedis();
  log.info('Redis initialized');

  // Create Solana connection
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

  // Start from current slot
  const currentSlot = await connection.getSlot();
  return Math.max(0, currentSlot - 100); // Start 100 slots back to catch recent events
}

/**
 * Fetch signatures for a slot range
 */
async function fetchSignatures(startSlot: number, endSlot: number) {
  try {
    const signatures = await connection.getSignaturesForAddress(programId, {
      minContextSlot: startSlot,
      maxContextSlot: endSlot,
      limit: 1000,
    });
    return signatures;
  } catch (error) {
    log.error({ error, startSlot, endSlot }, 'Failed to fetch signatures');
    return [];
  }
}

/**
 * Process a single transaction
 */
async function processTransaction(signature: string) {
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
      : message.staticAccountKeys;
    
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

    } catch (error) {
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

  connection.onLogs(
    programId,
    async (logs, context) => {
      if (logs.err) {
        log.warn({ err: logs.err }, 'Log error');
        return;
      }

      // Process the transaction
      if (logs.signature) {
        await processTransaction(logs.signature);
      }
    },
    COMMITMENT
  );

  log.info('Subscribed to program logs');
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
    
    // Start both polling and WebSocket subscription
    await Promise.all([
      startIndexing(),
      subscribeToLogs(),
    ]);

  } catch (error) {
    log.error({ error }, 'Fatal error');
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the service
main();
</task_progress>
</write_to_file>