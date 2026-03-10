/**
 * SSS Token Mint/Burn Service
 * 
 * REST API for creating and managing mint/burn requests
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import {
  initDatabase,
  closeDatabase,
  initRedis,
  closeRedis,
  logger,
  createMintBurnRequest,
  getMintBurnRequestById,
  getMintBurnRequestByIdempotencyKey,
  updateMintBurnRequestStatus,
  getPendingRequests,
  isBlacklisted,
  createAuditLog,
  CreateMintRequestSchema,
  CreateBurnRequestSchema,
  SSS_TOKEN_PROGRAM_ID,
  ERROR_CODES,
  HTTP_STATUS,
} from '@sss-backend/shared';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || SSS_TOKEN_PROGRAM_ID;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || './secrets/minter.json';

const log = logger.child({ service: 'mint-burn-service' });

let connection: Connection;
let program: Program | null = null;
let minterKeypair: Keypair | null = null;

// Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  log.info({ method: req.method, path: req.path }, 'Request');
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mint-burn-service', timestamp: new Date().toISOString() });
});

// ============================================
// Mint Request Endpoints
// ============================================

// Create mint request
app.post('/api/v1/mint-requests', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateMintRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
    }

    const { mintAddress, amount, recipient, idempotencyKey, metadata } = parseResult.data;

    // Check if recipient is blacklisted
    const blacklisted = await isBlacklisted(recipient);
    if (blacklisted) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.ADDRESS_BLACKLISTED,
          message: 'Recipient address is blacklisted',
        },
      });
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await getMintBurnRequestByIdempotencyKey(idempotencyKey);
      if (existing) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          error: {
            code: ERROR_CODES.DUPLICATE_IDEMPOTENCY_KEY,
            message: 'Request with this idempotency key already exists',
          },
          data: { requestId: existing.id },
        });
      }
    }

    // Create request
    const requestId = await createMintBurnRequest({
      type: 'mint',
      mintAddress,
      amount,
      recipient,
      idempotencyKey,
      metadata,
    });

    // Audit log
    await createAuditLog({
      action: 'mint_request_created',
      entityType: 'mint_request',
      entityId: requestId,
      details: { mintAddress, amount, recipient },
    });

    log.info({ requestId, mintAddress, amount, recipient }, 'Mint request created');

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { requestId, status: 'pending' },
    });

    // Trigger background processing
    processRequest(requestId).catch(err => {
      log.error({ err, requestId }, 'Failed to process mint request');
    });

  } catch (error) {
    log.error({ error }, 'Failed to create mint request');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Get mint request status
app.get('/api/v1/mint-requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getMintBurnRequestById(req.params.id);
    
    if (!request) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.REQUEST_NOT_FOUND, message: 'Request not found' },
      });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    log.error({ error }, 'Failed to get mint request');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Burn Request Endpoints
// ============================================

// Create burn request
app.post('/api/v1/burn-requests', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateBurnRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid request body',
          details: parseResult.error.issues,
        },
      });
    }

    const { mintAddress, amount, idempotencyKey, metadata } = parseResult.data;

    // Check idempotency
    if (idempotencyKey) {
      const existing = await getMintBurnRequestByIdempotencyKey(idempotencyKey);
      if (existing) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          error: {
            code: ERROR_CODES.DUPLICATE_IDEMPOTENCY_KEY,
            message: 'Request with this idempotency key already exists',
          },
          data: { requestId: existing.id },
        });
      }
    }

    // Create request
    const requestId = await createMintBurnRequest({
      type: 'burn',
      mintAddress,
      amount,
      idempotencyKey,
      metadata,
    });

    // Audit log
    await createAuditLog({
      action: 'burn_request_created',
      entityType: 'burn_request',
      entityId: requestId,
      details: { mintAddress, amount },
    });

    log.info({ requestId, mintAddress, amount }, 'Burn request created');

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { requestId, status: 'pending' },
    });

    // Trigger background processing
    processRequest(requestId).catch(err => {
      log.error({ err, requestId }, 'Failed to process burn request');
    });

  } catch (error) {
    log.error({ error }, 'Failed to create burn request');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Get burn request status
app.get('/api/v1/burn-requests/:id', async (req: Request, res: Response) => {
  try {
    const request = await getMintBurnRequestById(req.params.id);
    
    if (!request) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.REQUEST_NOT_FOUND, message: 'Request not found' },
      });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    log.error({ error }, 'Failed to get burn request');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Background Processing
// ============================================

async function processRequest(requestId: string) {
  try {
    const request = await getMintBurnRequestById(requestId);
    if (!request || request.status !== 'pending') {
      return;
    }

    // Update status to processing
    await updateMintBurnRequestStatus(requestId, 'processing');

    if (!program || !minterKeypair) {
      throw new Error('Program or keypair not initialized');
    }

    // Build and send transaction
    // Note: This is a simplified version - actual implementation would use the SDK
    const txSignature = `simulated_tx_${uuidv4()}`;

    // Update status to completed
    await updateMintBurnRequestStatus(requestId, 'completed', txSignature);
    
    log.info({ requestId, txSignature }, 'Request completed');

  } catch (error) {
    log.error({ error, requestId }, 'Request processing failed');
    await updateMintBurnRequestStatus(
      requestId, 
      'failed', 
      undefined, 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// ============================================
// Initialization
// ============================================

async function init() {
  log.info('Initializing mint/burn service...');

  // Initialize database
  initDatabase();
  log.info('Database initialized');

  // Initialize Redis
  initRedis();
  log.info('Redis initialized');

  // Create Solana connection
  connection = new Connection(RPC_URL, 'confirmed');
  log.info({ rpcUrl: RPC_URL }, 'Solana connection established');

  // Load minter keypair
  const keypairFullPath = path.resolve(KEYPAIR_PATH);
  if (fs.existsSync(keypairFullPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairFullPath, 'utf-8'));
    minterKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    log.info({ publicKey: minterKeypair.publicKey.toString() }, 'Minter keypair loaded');
  } else {
    log.warn({ path: keypairFullPath }, 'Minter keypair not found - transactions will be simulated');
  }

  log.info('Mint/Burn service initialized');
}

// Graceful shutdown
async function shutdown() {
  log.info('Shutting down mint/burn service...');
  await closeDatabase();
  await closeRedis();
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
