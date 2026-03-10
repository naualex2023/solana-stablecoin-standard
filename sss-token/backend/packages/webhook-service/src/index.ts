/**
 * SSS Token Webhook Service
 * 
 * REST API for webhook subscriptions and event delivery
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import CryptoJS from 'crypto-js';
import {
  initDatabase,
  closeDatabase,
  initRedis,
  closeRedis,
  subscribe,
  logger,
  createWebhookSubscription,
  getWebhookSubscription,
  deleteWebhookSubscription,
  getActiveSubscriptions,
  createWebhookDelivery,
  updateWebhookDeliveryStatus,
  getPendingDeliveries,
  createAuditLog,
  query,
  CreateWebhookSubscriptionSchema,
  REDIS_CHANNELS,
  ERROR_CODES,
  HTTP_STATUS,
} from '@sss-backend/shared';

// Configuration
const PORT = parseInt(process.env.PORT || '3003');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '5');
const RETRY_INTERVAL = process.env.RETRY_INTERVAL || '*/5 * * * *'; // Every 5 minutes

const log = logger.child({ service: 'webhook-service' });

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
  res.json({ status: 'ok', service: 'webhook-service', timestamp: new Date().toISOString() });
});

// ============================================
// Subscription Endpoints
// ============================================

// List subscriptions
app.get('/api/v1/subscriptions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await query(
      'SELECT * FROM webhook_subscriptions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) as count FROM webhook_subscriptions');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: Math.floor(offset / limit) + 1, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error({ error }, 'Failed to list subscriptions');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Create subscription
app.post('/api/v1/subscriptions', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateWebhookSubscriptionSchema.safeParse(req.body);
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

    const { url, eventTypes, mintAddresses, description } = parseResult.data;

    const subscriptionId = await createWebhookSubscription({
      url,
      eventTypes,
      mintAddresses,
      description,
    });

    await createAuditLog({
      action: 'webhook_subscription_created',
      entityType: 'webhook_subscription',
      entityId: subscriptionId.toString(),
      details: { url, eventTypes },
    });

    log.info({ subscriptionId, url }, 'Webhook subscription created');

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { id: subscriptionId, url, eventTypes, mintAddresses, active: true },
    });
  } catch (error) {
    log.error({ error }, 'Failed to create subscription');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Get subscription
app.get('/api/v1/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const subscription = await getWebhookSubscription(req.params.id);
    
    if (!subscription) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Subscription not found' },
      });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    log.error({ error }, 'Failed to get subscription');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// Delete subscription
app.delete('/api/v1/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteWebhookSubscription(req.params.id);
    
    if (!deleted) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Subscription not found' },
      });
    }

    await createAuditLog({
      action: 'webhook_subscription_deleted',
      entityType: 'webhook_subscription',
      entityId: req.params.id,
    });

    log.info({ subscriptionId: req.params.id }, 'Webhook subscription deleted');

    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    log.error({ error }, 'Failed to delete subscription');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Delivery Endpoints
// ============================================

// List deliveries
app.get('/api/v1/deliveries', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const subscriptionId = req.query.subscriptionId as string;

    let sql = 'SELECT * FROM webhook_deliveries';
    const params: any[] = [];
    
    if (subscriptionId) {
      sql += ' WHERE subscription_id = $1';
      params.push(subscriptionId);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    log.error({ error }, 'Failed to list deliveries');
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Internal server error' },
    });
  }
});

// ============================================
// Webhook Delivery Logic
// ============================================

function generateSignature(payload: string, secret: string): string {
  return CryptoJS.HmacSHA256(payload, secret).toString();
}

async function deliverWebhook(deliveryId: number, url: string, payload: object): Promise<boolean> {
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
      await updateWebhookDeliveryStatus(deliveryId, 'delivered', response.status);
      log.info({ deliveryId, url, status: response.status }, 'Webhook delivered');
      return true;
    } else {
      await updateWebhookDeliveryStatus(deliveryId, 'failed', response.status);
      log.warn({ deliveryId, url, status: response.status }, 'Webhook failed');
      return false;
    }
  } catch (error) {
    await updateWebhookDeliveryStatus(deliveryId, 'failed', 0, error instanceof Error ? error.message : 'Unknown error');
    log.error({ error, deliveryId, url }, 'Webhook delivery error');
    return false;
  }
}

async function processEvent(eventData: any) {
  try {
    const subscriptions = await getActiveSubscriptions();
    
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
      const deliveryId = await createWebhookDelivery({
        subscriptionId: sub.id,
        eventId: eventData.id,
        url: sub.url,
        payload: eventData,
      });

      // Attempt delivery
      await deliverWebhook(deliveryId, sub.url, eventData);
    }
  } catch (error) {
    log.error({ error }, 'Failed to process event');
  }
}

async function retryFailedDeliveries() {
  try {
    const pending = await getPendingDeliveries(MAX_RETRIES);
    log.info({ count: pending.length }, 'Retrying failed deliveries');

    for (const delivery of pending) {
      await deliverWebhook(delivery.id, delivery.url, delivery.payload);
    }
  } catch (error) {
    log.error({ error }, 'Failed to retry deliveries');
  }
}

// ============================================
// Background Jobs
// ============================================

function startBackgroundJobs() {
  // Retry failed deliveries
  cron.schedule(RETRY_INTERVAL, retryFailedDeliveries);
  log.info({ schedule: RETRY_INTERVAL }, 'Background jobs started');
}

// ============================================
// Redis Event Listener
// ============================================

async function startEventListener() {
  await subscribe(REDIS_CHANNELS.EVENTS, (message) => {
    try {
      const eventData = JSON.parse(message);
      processEvent(eventData);
    } catch (error) {
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

  initDatabase();
  log.info('Database initialized');

  initRedis();
  log.info('Redis initialized');

  startBackgroundJobs();
  await startEventListener();

  log.info('Webhook service initialized');
}

async function shutdown() {
  log.info('Shutting down webhook service...');
  await closeDatabase();
  await closeRedis();
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
