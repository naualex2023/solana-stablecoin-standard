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
