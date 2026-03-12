/**
 * SSS Token Indexer API Service
 * 
 * REST API for querying indexed events from PostgreSQL
 * Used by frontend to display stablecoins and transaction history
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import {
  initDatabase,
  closeDatabase,
  logger,
  SSS_TOKEN_PROGRAM_ID,
} from '@sss-backend/shared';

// Configuration
const PORT = parseInt(process.env.PORT || '3004');
const PROGRAM_ID = process.env.SSS_PROGRAM_ID || SSS_TOKEN_PROGRAM_ID;

const log = logger.child({ service: 'indexer-api' });

// Database pool (reuse from shared or create new)
let pool: Pool;

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

// ============================================
// Health Check
// ============================================

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'indexer-api', 
    timestamp: new Date().toISOString(),
    programId: PROGRAM_ID,
  });
});

// ============================================
// Events API
// ============================================

// List all events with pagination
app.get('/api/events', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const instructionType = req.query.type as string;
    const mintAddress = req.query.mint as string;

    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (instructionType) {
      query += ` AND instruction_type ILIKE $${paramIndex++}`;
      params.push(`%${instructionType}%`);
    }

    if (mintAddress) {
      query += ` AND mint_address ILIKE $${paramIndex++}`;
      params.push(`%${mintAddress}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM events WHERE 1=1';
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (instructionType) {
      countQuery += ` AND instruction_type ILIKE $${countParamIndex++}`;
      countParams.push(`%${instructionType}%`);
    }

    if (mintAddress) {
      countQuery += ` AND mint_address ILIKE $${countParamIndex++}`;
      countParams.push(`%${mintAddress}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to list events');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list events' },
    });
  }
});

// Get event by signature
app.get('/api/events/:signature', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM events WHERE signature = $1',
      [req.params.signature]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Event not found' },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log.error({ error }, 'Failed to get event');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get event' },
    });
  }
});

// ============================================
// Stablecoins API (Aggregated from events)
// ============================================

// List all stablecoins (aggregated from Initialize events)
app.get('/api/stablecoins', async (req: Request, res: Response) => {
  try {
    // Get unique stablecoins from Initialize events
    // Note: Anchor instruction name is "Initialize", not "CreateStablecoin"
    const result = await pool.query(`
      SELECT DISTINCT ON (mint_address)
        mint_address as address,
        mint_address as mint,
        data->>'name' as name,
        data->>'symbol' as symbol,
        data->'features'->>'permanentDelegate' as "enablePermanentDelegate",
        data->'features'->>'transferHook' as "enableTransferHook",
        data->'features'->>'defaultAccountFrozen' as "defaultAccountFrozen",
        created_at,
        (
          SELECT COUNT(DISTINCT (data->'accounts'->>2))
          FROM events e2 
          WHERE e2.mint_address = events.mint_address 
          AND e2.instruction_type = 'MintTokens'
        ) as "holderCount",
        (
          SELECT COUNT(*)::text
          FROM events e3
          WHERE e3.mint_address = events.mint_address
          AND e3.instruction_type = 'MintTokens'
        ) as "mintCount",
        (
          SELECT COUNT(*)::text
          FROM events e4
          WHERE e4.mint_address = events.mint_address
          AND e4.instruction_type = 'BurnTokens'
        ) as "burnCount"
      FROM events
      WHERE instruction_type = 'Initialize'
      AND mint_address != ''
      ORDER BY mint_address, created_at DESC
    `);

    // Transform to frontend format
    const stablecoins = result.rows.map(row => ({
      address: row.address,
      mint: row.mint,
      name: row.name || 'SSS Stablecoin',
      symbol: row.symbol || 'SSS',
      decimals: 6,
      paused: false, // Would need to track from Pause events
      features: {
        permanentDelegate: row.enablePermanentDelegate === 'true',
        transferHook: row.enableTransferHook === 'true',
        defaultAccountFrozen: row.defaultAccountFrozen === 'true',
      },
      mintCount: parseInt(row.mintCount) || 0,
      burnCount: parseInt(row.burnCount) || 0,
      holderCount: parseInt(row.holderCount) || 0,
      createdAt: row.created_at,
    }));

    res.json(stablecoins);
  } catch (error) {
    log.error({ error }, 'Failed to list stablecoins');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list stablecoins' },
    });
  }
});

// Get single stablecoin by mint address
app.get('/api/stablecoins/:mint', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;

    // Get stablecoin info from Initialize event
    const createEvent = await pool.query(
      `SELECT * FROM events 
       WHERE mint_address = $1 AND instruction_type = 'Initialize'
       ORDER BY created_at DESC LIMIT 1`,
      [mint]
    );

    if (createEvent.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: 'Stablecoin not found' },
      });
    }

    const row = createEvent.rows[0];

    // Get holder count (recipient is typically accounts[2] in MintTokens)
    const holderResult = await pool.query(`
      SELECT COUNT(DISTINCT (data->'accounts'->>2)) as count
      FROM events
      WHERE mint_address = $1
      AND instruction_type = 'MintTokens'
    `, [mint]);

    // Get mint/burn counts
    const mintBurnResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM events WHERE mint_address = $1 AND instruction_type = 'MintTokens') as mint_count,
        (SELECT COUNT(*) FROM events WHERE mint_address = $1 AND instruction_type = 'BurnTokens') as burn_count
    `, [mint]);

    // Check if paused
    const pauseResult = await pool.query(`
      SELECT instruction_type FROM events
      WHERE mint_address = $1 AND instruction_type IN ('Pause', 'Unpause')
      ORDER BY created_at DESC LIMIT 1
    `, [mint]);

    const isPaused = pauseResult.rows.length > 0 && 
                     pauseResult.rows[0].instruction_type === 'Pause';

    const stablecoin = {
      address: mint,
      mint: mint,
      name: row.data?.name || 'SSS Stablecoin',
      symbol: row.data?.symbol || 'SSS',
      decimals: 6,
      paused: isPaused,
      features: {
        permanentDelegate: row.data?.features?.permanentDelegate || false,
        transferHook: row.data?.features?.transferHook || false,
        defaultAccountFrozen: row.data?.features?.defaultAccountFrozen || false,
      },
      mintCount: parseInt(mintBurnResult.rows[0]?.mint_count) || 0,
      burnCount: parseInt(mintBurnResult.rows[0]?.burn_count) || 0,
      holderCount: parseInt(holderResult.rows[0]?.count) || 0,
      createdAt: row.created_at,
      createdBy: row.data?.accounts?.[0],
    };

    res.json(stablecoin);
  } catch (error) {
    log.error({ error }, 'Failed to get stablecoin');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get stablecoin' },
    });
  }
});

// Get transaction history for a stablecoin
app.get('/api/stablecoins/:mint/transactions', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(
      `SELECT 
        signature,
        slot,
        block_time,
        instruction_type,
        data->'accounts' as accounts,
        data->'instruction' as instruction,
        created_at
       FROM events
       WHERE mint_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [mint, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM events WHERE mint_address = $1',
      [mint]
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get transactions');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get transactions' },
    });
  }
});

// Get holders for a stablecoin
app.get('/api/stablecoins/:mint/holders', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;

    // Get unique recipients from MintTokens events
    const result = await pool.query(`
      SELECT DISTINCT 
        data->'accounts'->>2 as address
      FROM events
      WHERE mint_address = $1
      AND instruction_type = 'MintTokens'
      AND data->'accounts'->>2 IS NOT NULL
    `, [mint]);

    res.json({
      success: true,
      data: result.rows.filter(row => row.address).map(row => ({
        address: row.address,
        balance: '0', // Would need to calculate from events
      })),
    });
  } catch (error) {
    log.error({ error }, 'Failed to get holders');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get holders' },
    });
  }
});

// ============================================
// Statistics API
// ============================================

app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    // Total events
    const eventsResult = await pool.query('SELECT COUNT(*) FROM events');
    
    // Events by type
    const byTypeResult = await pool.query(`
      SELECT instruction_type, COUNT(*) as count
      FROM events
      GROUP BY instruction_type
      ORDER BY count DESC
    `);

    // Total stablecoins (using Initialize instruction)
    const stablecoinsResult = await pool.query(`
      SELECT COUNT(DISTINCT mint_address) as count
      FROM events
      WHERE instruction_type = 'Initialize'
      AND mint_address != ''
    `);

    // Latest block processed
    const slotResult = await pool.query(`
      SELECT MAX(slot) as latest_slot FROM events
    `);

    res.json({
      success: true,
      data: {
        totalEvents: parseInt(eventsResult.rows[0].count),
        eventsByType: byTypeResult.rows.reduce((acc, row) => {
          acc[row.instruction_type] = parseInt(row.count);
          return acc;
        }, {}),
        totalStablecoins: parseInt(stablecoinsResult.rows[0].count),
        latestSlot: slotResult.rows[0].latest_slot,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to get stats');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get stats' },
    });
  }
});

// ============================================
// Initialization
// ============================================

async function init() {
  log.info('Initializing indexer API service...');

  // Initialize database connection
  initDatabase();
  
  // Create our own pool for queries
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'sss',
    password: process.env.POSTGRES_PASSWORD || 'sss_secret',
    database: process.env.POSTGRES_DB || 'sss_token',
  });

  log.info('Database initialized');
  log.info('Indexer API service initialized');
}

// Graceful shutdown
async function shutdown() {
  log.info('Shutting down indexer API service...');
  await closeDatabase();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
async function main() {
  await init();
  
  app.listen(PORT, () => {
    log.info({ port: PORT }, 'Indexer API service listening');
    log.info(`Health check: http://localhost:${PORT}/health`);
    log.info(`Stablecoins API: http://localhost:${PORT}/api/stablecoins`);
    log.info(`Events API: http://localhost:${PORT}/api/events`);
  });
}

main();