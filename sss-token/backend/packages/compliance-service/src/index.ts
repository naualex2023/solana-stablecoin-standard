/**
 * SSS Token Compliance Service
 * 
 * REST API for blacklist management and OFAC sanctions screening
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import {
  initDatabase,
  closeDatabase,
  initRedis,
  closeRedis,
  logger,
  createBlacklistEntry,
  getBlacklistEntry,
  removeBlacklistEntry,
  isBlacklisted,
  getPendingOnChainBlacklist,
  updateBlacklistOnChainStatus,
  createAuditLog,
  query,
  AddToBlacklistSchema,
  SSS_TOKEN_PROGRAM_ID,
  ERROR_CODES,
  HTTP_STATUS,
} from '@sss-backend/shared';

// Configuration
const PORT = parseInt(process.env.PORT || '3002');
const RPC_URL = process.env.SOLANA_RPC_URL || 'http://localhost:8899';
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || SSS_TOKEN_PROGRAM_ID;
const OFAC_SYNC_INTERVAL = process.env.OFAC_SYNC_INTERVAL || '0 0 * * *'; // Daily at midnight

const log = logger.child({ service: 'compliance-service' });

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
  res.json({ status: 'ok', service: 'compliance-service', timestamp: new Date().toISOString() });
});

// ============================================
// Blacklist Endpoints
// ============================================

// List blacklist entries
app.get('/api/v1/blacklist', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const source = req.query.source as string;

    let sql = 'SELECT * FROM blacklist';
    const params: any[] = [];
    
    if (source) {
      sql += ' WHERE source = $1';
      params.push(source);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);
    
    // Get total count
    const countResult = await query('SELECT COUNT(*) as count FROM blacklist' + (source ? ' WHERE source = $1' : ''), source ? [source] : []);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: Math.floor(offset / limit) + 1, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error({ error }, 'Failed to list blacklist');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Get single blacklist entry
app.get('/api/v1/blacklist/:address', async (req: Request, res: Response) => {
  try {
    const entry = await getBlacklistEntry(req.params.address);
    
    if (!entry) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Address not in blacklist' },
      });
    }

    res.json({ success: true, data: entry });
  } catch (error) {
    log.error({ error }, 'Failed to get blacklist entry');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Add to blacklist
app.post('/api/v1/blacklist', async (req: Request, res: Response) => {
  try {
    const parseResult = AddToBlacklistSchema.safeParse(req.body);
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

    const { address, reason, syncOnChain } = parseResult.data;

    const entryId = await createBlacklistEntry({
      address,
      reason,
      source: 'manual',
    });

    await createAuditLog({
      action: 'blacklist_add',
      entityType: 'blacklist_entry',
      entityId: entryId.toString(),
      details: { address, reason },
    });

    log.info({ address, reason, entryId }, 'Address added to blacklist');

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { id: entryId, address, reason, onChain: false },
    });

    // TODO: Sync on-chain if requested
    if (syncOnChain) {
      log.info({ address }, 'On-chain sync requested (not implemented)');
    }
  } catch (error) {
    log.error({ error }, 'Failed to add to blacklist');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Remove from blacklist
app.delete('/api/v1/blacklist/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    const entry = await getBlacklistEntry(address);
    if (!entry) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Address not in blacklist' },
      });
    }

    await removeBlacklistEntry(address);

    await createAuditLog({
      action: 'blacklist_remove',
      entityType: 'blacklist_entry',
      entityId: address,
      details: { address },
    });

    log.info({ address }, 'Address removed from blacklist');

    res.json({ success: true, data: { address, removed: true } });
  } catch (error) {
    log.error({ error }, 'Failed to remove from blacklist');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Seize Endpoint (SSS-2)
// ============================================

// Seize tokens from a frozen account
app.post('/api/v1/seize', async (req: Request, res: Response) => {
  try {
    const { mintAddress, sourceToken, destToken, amount } = req.body;

    if (!mintAddress || !sourceToken || !destToken || !amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Missing required fields: mintAddress, sourceToken, destToken, amount',
        },
      });
    }

    // Verify source token account is frozen (TODO: Check on-chain state)
    
    // Create audit log for seize request
    await createAuditLog({
      action: 'seize_request_created',
      entityType: 'seize_request',
      entityId: `${sourceToken}-${Date.now()}`,
      details: { mintAddress, sourceToken, destToken, amount },
    });

    log.info({ mintAddress, sourceToken, destToken, amount }, 'Seize request created');

    // TODO: Execute actual seize transaction using the SDK
    // The seize operation uses the permanent delegate PDA to transfer from frozen accounts
    // PDA seeds: ["permanent_delegate", mint.key()]

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        status: 'pending',
        mintAddress,
        sourceToken,
        destToken,
        amount,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to create seize request');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Screening Endpoints
// ============================================

// Check if address is sanctioned
app.get('/api/v1/screening/check/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    const blacklisted = await isBlacklisted(address);
    
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
  } catch (error) {
    log.error({ error }, 'Failed to check screening');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// OFAC Sanctions Endpoints
// ============================================

// Get sync status
app.get('/api/v1/sanctions/status', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM sanctions_sync_status WHERE source = $1', ['ofac']);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    log.error({ error }, 'Failed to get sanctions status');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Trigger OFAC sync
app.post('/api/v1/sanctions/sync', async (req: Request, res: Response) => {
  try {
    log.info('OFAC sync triggered');
    // TODO: Implement actual OFAC sync
    res.json({
      success: true,
      data: { message: 'Sync started', timestamp: new Date().toISOString() },
    });
  } catch (error) {
    log.error({ error }, 'Failed to sync sanctions');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Background Jobs
// ============================================

function startBackgroundJobs() {
  // Schedule OFAC sync
  cron.schedule(OFAC_SYNC_INTERVAL, async () => {
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

  initDatabase();
  log.info('Database initialized');

  initRedis();
  log.info('Redis initialized');

  startBackgroundJobs();

  log.info('Compliance service initialized');
}

async function shutdown() {
  log.info('Shutting down compliance service...');
  await closeDatabase();
  await closeRedis();
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
